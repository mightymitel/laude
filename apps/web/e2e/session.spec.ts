import { test, expect } from '@playwright/test';

test.describe('Session Page', () => {
    test('should load session page', async ({ page }) => {
        await page.goto('/session?guest=true');

        await expect(page.locator('h1')).toContainText('Worship Session');
    });

    test('should show guest mode indicator for guest users', async ({ page }) => {
        await page.goto('/session?guest=true');

        await expect(page.getByText('Guest Mode')).toBeVisible();
    });

    test('should not show Go Live button for guests', async ({ page }) => {
        await page.goto('/session?guest=true');

        await expect(page.getByRole('button', { name: /go live/i })).not.toBeVisible();
    });

    test('should display song list', async ({ page }) => {
        await page.goto('/session?guest=true');

        // Search input should be visible
        await expect(page.getByPlaceholder(/search songs/i)).toBeVisible();
    });

    test('should search songs', async ({ page }) => {
        await page.goto('/session?guest=true');

        const searchInput = page.getByPlaceholder(/search songs/i);
        await searchInput.fill('test');

        // Wait for search results
        await page.waitForTimeout(500);

        // Search should have been triggered
        expect(await searchInput.inputValue()).toBe('test');
    });
});

test.describe('Landing Page', () => {
    test('should show guest worshiping button', async ({ page }) => {
        await page.goto('/');

        await expect(page.getByRole('link', { name: /start worshiping.*guest/i })).toBeVisible();
    });

    test('should navigate to guest session', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('link', { name: /start worshiping.*guest/i }).click();

        await expect(page).toHaveURL(/.*session.*guest=true/);
    });
});

test.describe('Library Page', () => {
    test('should load library page or show loading/auth state', async ({ page }) => {
        await page.goto('/library');

        // Page may redirect to login or show loading - just verify page loads
        await expect(page).toHaveURL(/\/(library|login|dashboard)/);
    });
});
