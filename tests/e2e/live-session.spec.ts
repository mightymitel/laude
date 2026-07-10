import { test, expect, type Page } from '@playwright/test';

// Test credentials
const TEST_USER = {
    email: 'testuser@test.com',
    password: '12345678',
};

// Helper: Login
async function login(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|session)/);
}

test.describe('Live Session QR Code and Viewport Features', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
    });

    test('should show share modal with viewport selector when going live', async ({ page }) => {
        // Navigate to session page
        await page.goto('/session');
        await page.waitForLoadState('networkidle');

        // Click Go Live button
        const goLiveBtn = page.locator('button:has-text("Go Live")');
        await expect(goLiveBtn).toBeVisible();
        await goLiveBtn.click();

        // Wait for session to start and Share button to appear
        await expect(page.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });

        // Click Share button
        await page.click('button:has-text("Share")');

        // Verify modal is visible
        const shareModal = page.locator('text=Share Session');
        await expect(shareModal).toBeVisible();

        // Verify viewport selector buttons are present (scoped to the modal —
        // the session header's directives bar also has stage/instrument buttons).
        // The modal offers the four CONTRACT classes ('audience' died with its
        // alias — DEC-98 cleanup, session #5).
        const modal = page.locator('[class*="qrModal"]');
        await expect(modal.locator('button:has-text("Main")')).toBeVisible();
        await expect(modal.locator('button:has-text("Instrument")')).toBeVisible();
        await expect(modal.locator('button:has-text("Stage")')).toBeVisible();
        await expect(modal.locator('button:has-text("Subtitles")')).toBeVisible();

        // Close modal
        await page.click('button:has-text("Close")', { force: true });
        await expect(shareModal).not.toBeVisible();

        // End the live session
        await page.click('button:has-text("End Live")');
    });

    test('viewer should have viewport dropdown and chord style selector', async ({ page, context }) => {
        // Start a live session first
        await page.goto('/session');
        await page.waitForLoadState('networkidle');

        // Go live
        await page.click('button:has-text("Go Live")');
        await expect(page.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });

        // Get the access code from the Share modal URL
        await page.click('button:has-text("Share")');
        const urlText = await page.locator('p').filter({ hasText: '/view/' }).textContent();
        expect(urlText).toBeTruthy();
        const accessCode = urlText!.split('/view/')[1].split('?')[0];
        await page.click('button:has-text("Close")', { force: true });

        // Select a song to display - use the result items from sidebar
        await page.waitForTimeout(1000);
        const songButton = page.locator('[class*="resultItem"]').first();
        if (await songButton.isVisible({ timeout: 3000 })) {
            await songButton.click();
            await page.waitForTimeout(1000);
        }

        // Open viewer in stage mode (header visible with controls)
        const viewerPage = await context.newPage();
        await viewerPage.goto(`/view/${accessCode}?type=stage`);
        await viewerPage.waitForLoadState('networkidle');

        // Wait for song content to load (songTitle appears when song is displayed)
        await viewerPage.waitForSelector('[data-testid="song-title"]', { timeout: 15000 });

        // Check for viewport dropdown
        const viewportDropdown = viewerPage.locator('[data-testid="viewport-select"]');
        await expect(viewportDropdown).toBeVisible({ timeout: 5000 });

        // Verify dropdown has the viewport-contract preset classes
        // (v1: 'audience' was renamed to 'main' — see docs/VIEWPORT_CONTRACT.md)
        const options = await viewportDropdown.locator('option').allTextContents();
        expect(options.some(o => o.includes('Main'))).toBeTruthy();
        expect(options.some(o => o.includes('Instrument'))).toBeTruthy();
        expect(options.some(o => o.includes('Stage'))).toBeTruthy();
        expect(options.some(o => o.includes('Subtitles'))).toBeTruthy();

        // Chord style selector should be visible in stage mode
        const chordStyleDropdown = viewerPage.locator('[data-testid="chord-style-select"]');
        await expect(chordStyleDropdown).toBeVisible();

        // Verify chord notation options come from the @laude/chords registry
        // (device-notation per DEC-42/45; replaces the fixed 4-style select)
        const chordOptions = await chordStyleDropdown.locator('option').allTextContents();
        expect(chordOptions.some(o => o.includes('English'))).toBeTruthy();
        expect(chordOptions.some(o => o.includes('Nashville'))).toBeTruthy();
        expect(chordOptions.some(o => o.includes('Do Re Mi'))).toBeTruthy();

        // End session from presenter page
        await page.click('button:has-text("End Live")');

        // Close viewer
        await viewerPage.close();
    });

    test('should be able to add songs to session playlist', async ({ page }) => {
        // Navigate to session page
        await page.goto('/session');
        await page.waitForLoadState('networkidle');

        // Wait for playlist panel to be visible
        const playlistPanel = page.locator('text=Session Playlist');
        await expect(playlistPanel).toBeVisible({ timeout: 10000 });

        // Initially the playlist should be empty
        await expect(page.locator('text=No songs in playlist')).toBeVisible();

        // Look for a song in search results
        const searchInput = page.locator('input[placeholder*="Search"]');
        await expect(searchInput).toBeVisible();

        // Hover over a search result to show menu button
        const songResult = page.locator('[class*="resultItem"]').first();
        if (await songResult.isVisible({ timeout: 3000 })) {
            await songResult.hover();

            // Click the menu button
            const menuBtn = page.locator('[class*="menuBtn"]').first();
            if (await menuBtn.isVisible({ timeout: 2000 })) {
                await menuBtn.click();

                // Click "Add to Playlist" (scoped: every result row has its own hidden menu)
                const addBtn = songResult.locator('button:has-text("Add to Playlist")');
                await expect(addBtn).toBeVisible({ timeout: 2000 });
                await addBtn.click();

                // Verify the playlist now has a song
                await expect(page.locator('text=No songs in playlist')).not.toBeVisible();

                // Verify playlist item is visible
                const playlistItem = page.locator('[class*="playlistItem"]').first();
                await expect(playlistItem).toBeVisible({ timeout: 3000 });
            }
        }
    });
});
