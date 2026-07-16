/**
 * WP-162 / DEC-133: per-song favorite key + notes.
 *  - ★ stores a favorite key; notes save with an honest empty state.
 *  - favoriteKey seeds SOLO play (quick session from the library).
 *  - THE BOUNDARY: in a LIVE session a fresh song pick sounds in the song's
 *    own key — a personal favorite never steers the broadcast effective_key.
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_USER = { email: 'testuser@test.com', password: '12345678' };

async function login(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|session)/);
}

test('favorite key + notes: set on song view, seed solo play, never steer a live session', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);

    // --- Set a favorite key ≠ default on the first library song ---
    await page.goto('/library');
    const firstCard = page.locator('a[href*="/library/"]:has(h3)').first();
    await firstCard.waitFor({ timeout: 15000 });
    const songTitle = (await firstCard.locator('h3').textContent())!
        .replace(/Official|Community/g, '')
        .trim();
    await firstCard.click();
    const transpose = page.locator('select').first();
    await transpose.waitFor({ timeout: 10000 });
    const songId = page.url().split('/library/')[1]!.split('?')[0]!;

    // Idempotence: the emulator persists across runs, so a favorite from a
    // previous run may already exist (and would seed the select). Clear it,
    // then reload so the select seeds from the song's TRUE default key.
    const star = page.getByTestId('favorite-key-toggle');
    if ((await star.textContent()) === '★') {
        await star.click();
        await expect(star).toHaveText('☆');
        await page.reload();
        await transpose.waitFor({ timeout: 10000 });
    }
    const DEFAULT = await transpose.inputValue();
    const FAVORITE = DEFAULT === 'F#' ? 'Bb' : 'F#';

    await transpose.selectOption(FAVORITE);
    await star.click();
    await expect(star).toHaveText('★');

    // --- Notes overlay: honest empty state → save → visible ---
    await expect(page.getByTestId('personal-notes')).toContainText('No personal notes');
    await page.getByTestId('notes-edit').click();
    await page.getByTestId('notes-input').fill('capo 2, Andrei conduce');
    await page.getByTestId('notes-save').click();
    await expect(page.getByTestId('notes-text')).toContainText('capo 2, Andrei conduce');

    // --- Reload: the favorite seeds the transpose select ---
    await page.reload();
    await expect(page.locator('select').first()).toHaveValue(FAVORITE, { timeout: 10000 });

    // --- Solo quick session: the favorite seeds the sounding key ---
    await page.goto(`/session?songId=${songId}`);
    await expect(page.getByTestId('owner-key-select')).toHaveValue(FAVORITE, { timeout: 15000 });

    // --- LIVE boundary ---
    await page.click('button:has-text("Go Live")');
    await page.locator('button:has-text("Share")').first().waitFor({ timeout: 15000 });
    await page.click('button:has-text("Share")');
    const viewerUrlText = await page.locator('p').filter({ hasText: '/view/' }).textContent();
    const accessCode = viewerUrlText!.split('/view/')[1]!.split('?')[0]!;
    await page.click('button:has-text("Close")', { force: true });

    // Move OFF the favorite song: pick any other search result.
    const results = page.locator('[class*="resultItem"]');
    await results.first().waitFor({ timeout: 10000 });
    const n = await results.count();
    for (let i = 0; i < n; i++) {
        const text = await results.nth(i).textContent();
        if (text !== null && !text.includes(songTitle)) {
            await results.nth(i).click();
            break;
        }
    }
    await page.waitForTimeout(600);

    // Fresh LIVE pick of the favorite song via search: with the 'adopt'
    // policy the sounding key must be the song's OWN default — NOT the
    // picker's personal favorite (DEC-42 / WP-144 stays authoritative).
    await page.locator('input[placeholder*="Search"]').first().fill(songTitle);
    const match = page.locator('[class*="resultItem"]').filter({ hasText: songTitle }).first();
    await match.waitFor({ timeout: 10000 });
    await match.click();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('owner-key-select')).toHaveValue(DEFAULT);

    // A stage viewer hears the same broadcast key.
    const viewer = await page.context().newPage();
    await viewer.goto(`/view/${accessCode}?type=stage`);
    await expect(viewer.locator('[class*="meta"]')).toContainText(`Key: ${DEFAULT}`, { timeout: 10000 });
    await viewer.close();

    await page.click('button:has-text("End Live")');
});
