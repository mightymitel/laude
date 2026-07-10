
import { test, expect } from '@playwright/test';

// Test credentials
const TEST_USER = {
    email: 'testuser@test.com',
    password: '12345678',
};

async function login(page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|session)/);
}

test('debug playlist sync', async ({ browser }) => {
    const context = await browser.newContext();
    const ownerPage = await context.newPage();
    const presenterPage = await context.newPage();

    // Capture console logs
    ownerPage.on('console', msg => console.log(`[Owner Console] ${msg.text()}`));
    presenterPage.on('console', msg => console.log(`[Presenter Console] ${msg.text()}`));

    // 1. Owner logs in
    await login(ownerPage);
    await ownerPage.goto('/session');

    // 2. Add song to playlist
    await expect(ownerPage.locator('[class*="resultItem"]').first()).toBeVisible();

    // Click menu
    const firstResult = ownerPage.locator('[class*="resultItem"]').first();
    await firstResult.hover();
    await firstResult.locator('[class*="menuBtn"]').click({ force: true });
    await firstResult.locator('button:has-text("Add to Playlist")').click({ force: true });

    // Verify in owner view
    await expect(ownerPage.locator('[class*="playlistItem"]')).toHaveCount(1);

    // 3. Go Live
    await ownerPage.click('button:has-text("Go Live")');
    await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible();

    // Verify playlist is synced (round-trip) before sharing
    // When going live, the list might briefly flicker to empty until the server syncs back
    await expect(ownerPage.locator('[class*="playlistItem"]')).toHaveCount(1, { timeout: 10000 });

    // 4. Get Presenter Code
    await ownerPage.click('button:has-text("Share")', { force: true });
    // Force close to avoid flake
    const urlText = await ownerPage.locator('[class*="presenterUrl"]').textContent();
    const code = urlText.split('/present/')[1];
    await ownerPage.click('button:has-text("Close")', { force: true });

    // 5. Check Presenter View
    await presenterPage.goto(`/present/${code}`);
    await expect(presenterPage.getByRole('heading', { name: 'Presenter', exact: true })).toBeVisible();

    // DEBUG: Wait longer to see if it's just slow
    await presenterPage.waitForTimeout(5000);

    // Check count
    const count = await presenterPage.locator('[class*="playlistItem"]').count();
    console.log(`Presenter playlist count: ${count}`);

    await expect(presenterPage.locator('[class*="playlistItem"]')).toHaveCount(1);
});
