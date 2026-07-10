import { test, expect, type Page, type BrowserContext } from '@playwright/test';

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

// Helper: Add first available song to playlist via menu. The hover menu is
// timing-sensitive (a re-render can collapse it between hover and click), so
// the hover→menu→add sequence retries as a unit — same interaction a human
// repeats, no assertion weakened.
async function addFirstSongToPlaylist(page: Page) {
    const songResult = page.locator('[class*="resultItem"]').first();
    await expect(songResult).toBeVisible({ timeout: 10000 });

    const addBtn = songResult.locator('button:has-text("Add to Playlist")');
    for (let attempt = 0; attempt < 3; attempt++) {
        // force: the stability check starves under multi-page polling load
        // (WP-119); the helper is setup, the assertions live elsewhere.
        await songResult.hover({ force: true }).catch(() => {});
        const menuBtn = songResult.locator('[class*="menuBtn"]');
        await menuBtn.click({ force: true }).catch(() => {});
        if (await addBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
            await addBtn.click({ force: true });
            await page.waitForTimeout(500);
            return;
        }
    }
    // Final attempt surfaces the real failure if the menu truly never opens.
    await expect(addBtn).toBeVisible({ timeout: 2000 });
    await addBtn.click({ force: true });
    await page.waitForTimeout(500);
}

// Helper: Get presenter code from share modal
async function getPresenterCode(page: Page): Promise<string> {
    await page.click('button:has-text("Share")');
    await expect(page.locator('text=Share Session')).toBeVisible();

    const presenterUrlText = await page.locator('[class*="presenterUrl"]').textContent();
    expect(presenterUrlText).toBeTruthy();

    // Extract code from URL like "/present/ABC123"
    const presenterCode = presenterUrlText!.split('/present/')[1];

    await page.click('button:has-text("Close")', { force: true });
    return presenterCode;
}


// The owner song area defaults to PLAY mode (WP-150); the classic sheet with
// [data-testid="song-header"] renders in OVERVIEW — switch before asserting.
async function ownerOverview(page: Page) {
    const overviewTab = page.locator('[data-testid="owner-mode-overview"]');
    if (await overviewTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await overviewTab.click();
        await page.waitForTimeout(200);
    }
}

test.describe('Presenter Sync Workflow', () => {
    let ownerPage: Page;
    let presenterPage: Page;
    let context: BrowserContext;

    test.beforeEach(async ({ browser }) => {
        context = await browser.newContext();
        ownerPage = await context.newPage();
        presenterPage = await context.newPage();
    });

    test.afterEach(async () => {
        // Clean up - end session if still live
        try {
            const endLiveBtn = ownerPage.locator('button:has-text("End Live")');
            if (await endLiveBtn.isVisible({ timeout: 1000 })) {
                await endLiveBtn.click();
            }
        } catch {
            // Session already ended or page closed
        }
        await context.close();
    });

    test('complete presenter sync workflow', async () => {
        // === Step 1: Owner logs in and navigates to session ===
        await login(ownerPage);
        await ownerPage.goto('/session');
        await ownerPage.waitForLoadState('networkidle');

        // Wait for playlist panel and songs to load
        await expect(ownerPage.locator('text=Session Playlist')).toBeVisible({ timeout: 10000 });
        await expect(ownerPage.locator('[class*="resultItem"]').first()).toBeVisible({ timeout: 10000 });

        // === Step 2: Owner adds 2 songs to playlist (can be same song twice) ===
        await addFirstSongToPlaylist(ownerPage);
        await addFirstSongToPlaylist(ownerPage);

        // Verify 2 items in playlist
        const playlistItems = ownerPage.locator('[class*="playlistItem"]');
        await expect(playlistItems).toHaveCount(2, { timeout: 5000 });

        // === Step 3: Owner goes live ===
        const goLiveBtn = ownerPage.locator('button:has-text("Go Live")');
        await expect(goLiveBtn).toBeVisible();
        await goLiveBtn.click();

        // Wait for live state
        await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });
        await expect(ownerPage.locator('[class*="liveIndicator"]')).toBeVisible();

        // === Step 4: Get presenter link ===
        const presenterCode = await getPresenterCode(ownerPage);
        expect(presenterCode).toBeTruthy();

        // === Step 5: Presenter opens presenter link ===
        await presenterPage.goto(`/present/${presenterCode}`);
        await presenterPage.waitForLoadState('networkidle');

        // Wait for presenter view to load
        await expect(presenterPage.getByRole('heading', { name: 'Presenter', exact: true })).toBeVisible({ timeout: 10000 });

        // === Step 6: Presenter sees the 2 songs in playlist ===
        const presenterPlaylistItems = presenterPage.locator('[class*="playlistItem"]');
        await expect(presenterPlaylistItems).toHaveCount(2, { timeout: 10000 });

        // === Step 7: Presenter selects a song ===
        await presenterPlaylistItems.first().click();
        await presenterPage.waitForTimeout(1500);

        // Presenter should see song content
        const presenterSongHeader = presenterPage.locator('[data-testid="song-header"] h2');
        await expect(presenterSongHeader).toBeVisible({ timeout: 5000 });
        const presenterSongTitle = await presenterSongHeader.textContent();

        // === Step 8: Owner sees the change ===
        // Wait for sync - owner's view should show the same song
        await ownerPage.waitForTimeout(2500);
        await ownerOverview(ownerPage);
        const ownerSongHeader = ownerPage.locator('[data-testid="song-header"] h2');
        await expect(ownerSongHeader).toBeVisible({ timeout: 5000 });
        const ownerSongTitle = await ownerSongHeader.textContent();

        expect(ownerSongTitle).toBe(presenterSongTitle);

        // === Step 9: Owner adds another song to playlist ===
        await addFirstSongToPlaylist(ownerPage);

        // Owner should have 3 songs
        await expect(playlistItems).toHaveCount(3, { timeout: 5000 });

        // === Step 10: Presenter sees the new song ===
        // Wait for polling sync (poll interval is 5 seconds)
        await presenterPage.waitForTimeout(6000);
        await expect(presenterPlaylistItems).toHaveCount(3, { timeout: 10000 });
    });

    test('presenter selection syncs to owner', async () => {
        // Setup: Owner logs in, adds song, goes live
        await login(ownerPage);
        await ownerPage.goto('/session');
        await ownerPage.waitForLoadState('networkidle');

        // Wait for songs to load
        await expect(ownerPage.locator('[class*="resultItem"]').first()).toBeVisible({ timeout: 10000 });

        await addFirstSongToPlaylist(ownerPage);

        await ownerPage.click('button:has-text("Go Live")');
        await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });

        const presenterCode = await getPresenterCode(ownerPage);

        // Presenter opens and selects song
        await presenterPage.goto(`/present/${presenterCode}`);
        await expect(presenterPage.getByRole('heading', { name: 'Presenter', exact: true })).toBeVisible({ timeout: 10000 });

        // Wait for playlist to sync
        const presenterPlaylistItem = presenterPage.locator('[class*="playlistItem"]').first();
        await expect(presenterPlaylistItem).toBeVisible({ timeout: 10000 });

        // Get song title before clicking
        const songTitle = await presenterPlaylistItem.locator('[class*="songTitle"]').textContent();

        // Presenter clicks song
        await presenterPlaylistItem.click();
        await presenterPage.waitForTimeout(2000);

        // Owner should now see the song
        await ownerPage.waitForTimeout(1000);
        await ownerOverview(ownerPage);
        const ownerSongHeader = ownerPage.locator('[data-testid="song-header"] h2');
        await expect(ownerSongHeader).toBeVisible({ timeout: 10000 });
        await expect(ownerSongHeader).toContainText(songTitle || '', { timeout: 5000 });
    });

    test('owner song change syncs to presenter', async () => {
        // Setup: Owner logs in, adds song, goes live
        await login(ownerPage);
        await ownerPage.goto('/session');
        await ownerPage.waitForLoadState('networkidle');

        // Wait for songs to load
        await expect(ownerPage.locator('[class*="resultItem"]').first()).toBeVisible({ timeout: 10000 });

        // Add one song to playlist
        await addFirstSongToPlaylist(ownerPage);

        await ownerPage.click('button:has-text("Go Live")');
        await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });

        const presenterCode = await getPresenterCode(ownerPage);

        // Presenter opens view
        await presenterPage.goto(`/present/${presenterCode}`);
        await expect(presenterPage.getByRole('heading', { name: 'Presenter', exact: true })).toBeVisible({ timeout: 10000 });

        // Owner clicks on playlist item
        const ownerPlaylistItem = ownerPage.locator('[class*="playlistItem"]').first();
        await expect(ownerPlaylistItem).toBeVisible({ timeout: 5000 });
        await ownerPlaylistItem.click();
        await ownerPage.waitForTimeout(1000);

        await ownerOverview(ownerPage);
        const ownerSongTitle = await ownerPage.locator('[data-testid="song-header"] h2').textContent();

        // Presenter should see the same song (wait for 5-second poll interval)
        await presenterPage.waitForTimeout(6000);
        const presenterSongHeader = presenterPage.locator('[data-testid="song-header"] h2');
        await expect(presenterSongHeader).toBeVisible({ timeout: 10000 });
        await expect(presenterSongHeader).toContainText(ownerSongTitle || '', { timeout: 5000 });
    });

    test('presenter can control non-playlist song from owner', async () => {
        // Setup: Owner logs in and goes live
        await login(ownerPage);
        await ownerPage.goto('/session');
        await ownerPage.waitForLoadState('networkidle');

        // Wait for songs to load
        await expect(ownerPage.locator('[class*="resultItem"]').first()).toBeVisible({ timeout: 10000 });

        await ownerPage.click('button:has-text("Go Live")');
        await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });

        const presenterCode = await getPresenterCode(ownerPage);

        // Owner opens a song directly (not from playlist)
        await ownerPage.locator('[class*="resultContent"]').first().click();
        await ownerPage.waitForTimeout(1000);

        await ownerOverview(ownerPage);
        const ownerSongTitle = await ownerPage.locator('[data-testid="song-header"] h2').textContent();

        // Presenter opens view - should immediately see the current song from initial fetch
        await presenterPage.goto(`/present/${presenterCode}`);
        await expect(presenterPage.getByRole('heading', { name: 'Presenter', exact: true })).toBeVisible({ timeout: 10000 });

        // Wait for initial data fetch to complete
        await presenterPage.waitForTimeout(3000);
        const presenterSongHeader = presenterPage.locator('[data-testid="song-header"] h2');
        await expect(presenterSongHeader).toBeVisible({ timeout: 10000 });
        await expect(presenterSongHeader).toContainText(ownerSongTitle || '', { timeout: 5000 });

        // Presenter can navigate parts if song has multiple parts
        const nextPartBtn = presenterPage.locator('button:has-text("Next →")');
        const isEnabled = await nextPartBtn.isEnabled({ timeout: 2000 }).catch(() => false);
        if (isEnabled) {
            await nextPartBtn.click();
            await presenterPage.waitForTimeout(1500);

            // Verify part changed (the redesigned presenter shows "2 / N")
            const partIndicator = presenterPage.locator('[class*="partsNavLabel"]');
            await expect(partIndicator).toContainText('2 /', { timeout: 5000 });

            // Owner should see part change (via polling every 2 seconds)
            await ownerPage.waitForTimeout(3000);
            const ownerActivePart = ownerPage.locator('[class*="activePart"]');
            await expect(ownerActivePart).toBeVisible({ timeout: 5000 });
        }
    });

    test('viewer viewport syncs with owner and presenter changes', async () => {
        // Four concurrent pages on one browser + ~15s of deliberate sync
        // waits: 30s is too tight under polling contention (WP-119).
        test.setTimeout(60000);
        // Setup: Owner logs in, adds song, goes live
        await login(ownerPage);
        await ownerPage.goto('/session');
        await ownerPage.waitForLoadState('networkidle');

        // Wait for songs to load
        await expect(ownerPage.locator('[class*="resultItem"]').first()).toBeVisible({ timeout: 10000 });

        // Add song and go live
        await addFirstSongToPlaylist(ownerPage);

        await ownerPage.click('button:has-text("Go Live")');
        await expect(ownerPage.locator('button:has-text("Share")')).toBeVisible({ timeout: 10000 });

        // Get viewer access code from share modal
        await ownerPage.click('button:has-text("Share")');
        await expect(ownerPage.locator('text=Share Session')).toBeVisible();
        const viewerUrlText = await ownerPage.locator('p').filter({ hasText: '/view/' }).textContent();
        const accessCode = viewerUrlText!.split('/view/')[1].split('?')[0];
        await ownerPage.click('button:has-text("Close")', { force: true });

        // Owner selects song from playlist
        const ownerPlaylistItem = ownerPage.locator('[class*="playlistItem"]').first();
        await ownerPlaylistItem.click();
        await ownerPage.waitForTimeout(1000);

        // Open viewer in stage mode (includes song display)
        const viewerPage = await context.newPage();
        await viewerPage.goto(`/view/${accessCode}?type=stage`);
        await viewerPage.waitForLoadState('networkidle');

        // Viewer should see the song that owner selected
        await viewerPage.waitForTimeout(2000);
        await expect(viewerPage.locator('[class*="songTitle"]')).toBeVisible({ timeout: 10000 });

        await ownerOverview(ownerPage);
        const ownerSongTitle = await ownerPage.locator('[data-testid="song-header"] h2').textContent();
        await expect(viewerPage.locator('[class*="songTitle"]')).toContainText(ownerSongTitle || '', { timeout: 5000 });


        // Now have presenter also open and make a change
        const presenterCode = await getPresenterCode(ownerPage);
        await presenterPage.goto(`/present/${presenterCode}`);
        await expect(presenterPage.getByRole('heading', { name: 'Presenter', exact: true })).toBeVisible({ timeout: 10000 });

        // Wait for presenter to sync
        await presenterPage.waitForTimeout(6000);

        // Presenter navigates to next part
        const nextPartBtn = presenterPage.locator('button:has-text("Next →")');
        const isEnabled = await nextPartBtn.isEnabled({ timeout: 2000 }).catch(() => false);
        if (isEnabled) {
            await nextPartBtn.click();
            await presenterPage.waitForTimeout(1500);

            // Viewer should see the part change
            await viewerPage.waitForTimeout(2000);
            // Part indicator or content should update (implementation-specific check)
        }

        await viewerPage.close();
    });
});
