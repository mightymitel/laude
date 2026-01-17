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

    test('should show QR code modal with viewport links when going live', async ({ page }) => {
        // Navigate to session page
        await page.goto('/session');
        await page.waitForLoadState('networkidle');

        // Click Go Live button
        const goLiveBtn = page.locator('button:has-text("Go Live")');
        await expect(goLiveBtn).toBeVisible();
        await goLiveBtn.click();

        // Wait for session to start and QR button to appear
        await expect(page.locator('button:has-text("QR Code")')).toBeVisible({ timeout: 10000 });

        // Click QR Code button
        await page.click('button:has-text("QR Code")');

        // Verify QR modal is visible
        const qrModal = page.locator('text=Scan to Join');
        await expect(qrModal).toBeVisible();

        // Verify viewport quick links are present
        await expect(page.locator('button:has-text("Audience")')).toBeVisible();
        await expect(page.locator('button:has-text("Instrument")')).toBeVisible();
        await expect(page.locator('button:has-text("Stage")')).toBeVisible();

        // Close modal
        await page.click('button:has-text("Close")');
        await expect(qrModal).not.toBeVisible();

        // End the live session
        await page.click('button:has-text("End Live")');
    });

    test('viewer should have viewport dropdown and chord style selector', async ({ page, context }) => {
        // Start a live session first
        await page.goto('/session');
        await page.waitForLoadState('networkidle');

        // Go live
        await page.click('button:has-text("Go Live")');
        await expect(page.locator('button:has-text("QR Code")')).toBeVisible({ timeout: 10000 });

        // Get the access code from the QR Code modal URL
        await page.click('button:has-text("QR Code")');
        const urlText = await page.locator('p').filter({ hasText: '/view/' }).textContent();
        expect(urlText).toBeTruthy();
        const accessCode = urlText!.split('/view/')[1];
        await page.click('button:has-text("Close")');

        // Select a song to display (if available)
        const songItem = page.locator('button').filter({ hasText: /^[A-Za-z]/ }).first();
        if (await songItem.isVisible()) {
            await songItem.click();
            await page.waitForTimeout(500);
        }

        // Open viewer in new page
        const viewerPage = await context.newPage();
        await viewerPage.goto(`/view/${accessCode}`);
        await viewerPage.waitForLoadState('networkidle');

        // Check for viewport dropdown
        const viewportDropdown = viewerPage.locator('select').first();
        await expect(viewportDropdown).toBeVisible({ timeout: 10000 });

        // Verify dropdown has viewport options
        const options = await viewportDropdown.locator('option').allTextContents();
        expect(options.some(o => o.includes('Audience'))).toBeTruthy();
        expect(options.some(o => o.includes('Instrument'))).toBeTruthy();
        expect(options.some(o => o.includes('Stage'))).toBeTruthy();

        // Change to Instrument mode
        await viewportDropdown.selectOption('instrument');
        await expect(viewerPage).toHaveURL(/type=instrument/);

        // Chord style selector should now be visible
        const chordStyleDropdown = viewerPage.locator('select').nth(1);
        await expect(chordStyleDropdown).toBeVisible();

        // End session from presenter page
        await page.click('button:has-text("End Live")');

        // Close viewer
        await viewerPage.close();
    });
});
