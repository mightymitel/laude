/**
 * The key-divergence invariant (WP-144/145): every client's sounding key ==
 * the broadcast effective_key. Owner + two other clients (stage viewport +
 * presenter) on a playlist whose entry has a key OVERRIDE differing from
 * songs.default_key — the exact repro of the instrument-viewport bug. Plus
 * the hold policy: a song change keeps the on-screen key.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

const TEST_USER = { email: 'testuser@test.com', password: '12345678' };

async function login(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|session)/);
}

async function addFirstSongToPlaylist(page: Page) {
    const songResult = page.locator('[class*="resultItem"]').first();
    await expect(songResult).toBeVisible({ timeout: 10000 });
    await songResult.hover();
    const menuBtn = songResult.locator('[class*="menuBtn"]');
    await expect(menuBtn).toBeVisible({ timeout: 2000 });
    await menuBtn.click();
    const addBtn = songResult.locator('button:has-text("Add to Playlist")');
    await expect(addBtn).toBeVisible({ timeout: 2000 });
    await addBtn.click();
    await page.waitForTimeout(500);
}

test.describe('effective_key invariant', () => {
    let context: BrowserContext;
    let ownerPage: Page;

    test.beforeEach(async ({ browser }) => {
        context = await browser.newContext();
        ownerPage = await context.newPage();
    });

    test.afterEach(async () => {
        try {
            const endLiveBtn = ownerPage.locator('button:has-text("End Live")');
            if (await endLiveBtn.isVisible({ timeout: 1000 })) {
                await endLiveBtn.click();
            }
        } catch {
            /* already ended */
        }
        await context.close();
    });

    test('all clients sound the broadcast key; hold policy survives a song change', async () => {
        await login(ownerPage);
        await ownerPage.goto('/session');
        await ownerPage.waitForLoadState('networkidle');

        // Two songs in the playlist; give the FIRST an override ≠ default_key.
        await addFirstSongToPlaylist(ownerPage);
        await ownerPage.locator('[class*="resultItem"]').nth(1).hover();
        const secondResult = ownerPage.locator('[class*="resultItem"]').nth(1);
        await secondResult.locator('[class*="menuBtn"]').click();
        await secondResult.locator('button:has-text("Add to Playlist")').click();
        await ownerPage.waitForTimeout(300);

        const firstItem = ownerPage.locator('[class*="playlistItem"]').first();
        const keySelect = firstItem.locator('select');
        const defaultKey = await keySelect.inputValue();
        const OVERRIDE = defaultKey === 'Bb' ? 'F#' : 'Bb'; // guaranteed ≠ default
        await keySelect.selectOption(OVERRIDE);
        await ownerPage.waitForTimeout(300);

        // Go live, collect both codes.
        await ownerPage.click('button:has-text("Go Live")');
        await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });
        await ownerPage.click('button:has-text("Share")');
        await expect(ownerPage.locator('text=Share Session')).toBeVisible();
        const viewerUrlText = await ownerPage.locator('p').filter({ hasText: '/view/' }).textContent();
        const accessCode = viewerUrlText!.split('/view/')[1].split('?')[0];
        const presenterUrlText = await ownerPage.locator('[class*="presenterUrl"]').textContent();
        const presenterCode = presenterUrlText!.split('/present/')[1];
        await ownerPage.click('button:has-text("Close")', { force: true });

        // SONG CHANGE with the override: the owner computes effective_key once.
        await firstItem.click();
        await ownerPage.waitForTimeout(800);

        // Client 1 — the owner's own surface.
        await expect(ownerPage.getByTestId('owner-key-select')).toHaveValue(OVERRIDE);

        // Client 2 — a stage viewport (metadata shows the sounding key).
        const stagePage = await context.newPage();
        await stagePage.goto(`/view/${accessCode}?type=stage`);
        await expect(stagePage.locator('[class*="meta"]')).toContainText(`Key: ${OVERRIDE}`, {
            timeout: 10000,
        });

        // Client 3 — the presenter surface.
        const presenterPage = await context.newPage();
        await presenterPage.goto(`/present/${presenterCode}`);
        await expect(presenterPage.locator('[class*="keyBadge"]')).toContainText(OVERRIDE, {
            timeout: 10000,
        });

        // HOLD policy (WP-145): switch, then change songs — the key stays.
        await ownerPage.locator('select').filter({ hasText: 'Adopt song key' }).selectOption('hold');
        await ownerPage.waitForTimeout(300);
        await ownerPage.locator('[class*="playlistItem"]').nth(1).click();
        await ownerPage.waitForTimeout(800);

        await expect(ownerPage.getByTestId('owner-key-select')).toHaveValue(OVERRIDE);
        await expect(stagePage.locator('[class*="meta"]')).toContainText(`Key: ${OVERRIDE}`);
        await expect(presenterPage.locator('[class*="keyBadge"]')).toContainText(OVERRIDE);

        // Hold must survive a PRESENTER-driven song change too — presenters
        // used to write effective_key directly, bypassing the policy.
        await presenterPage.locator('[class*="playlistItem"]').first().click();
        await presenterPage.waitForTimeout(800);
        await expect(ownerPage.getByTestId('owner-key-select')).toHaveValue(OVERRIDE);
        await expect(presenterPage.locator('[class*="keyBadge"]')).toContainText(OVERRIDE);
        await expect(stagePage.locator('[class*="meta"]')).toContainText(`Key: ${OVERRIDE}`);

        await stagePage.close();
        await presenterPage.close();
    });
});
