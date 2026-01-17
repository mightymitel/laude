import { test, expect } from '@playwright/test';

/**
 * These tests require authentication.
 * Auth state is loaded from test-output/.auth/user.json
 * 
 * To set up auth:
 * 1. Run: npx playwright test --project=setup --headed
 * 2. Complete Google login manually
 */

test.describe('Dashboard (Authenticated)', () => {
    test('should display dashboard after login', async ({ page }) => {
        await page.goto('/dashboard');

        await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('should show user welcome message', async ({ page }) => {
        await page.goto('/dashboard');

        await expect(page.getByText(/welcome back/i)).toBeVisible();
    });

    test('should have logout button', async ({ page }) => {
        await page.goto('/dashboard');

        await expect(page.getByRole('button', { name: /logout/i })).toBeVisible();
    });
});

test.describe('Library (Authenticated)', () => {
    test('should display My Library page', async ({ page }) => {
        await page.goto('/library');

        await expect(page.locator('h1')).toContainText('My Library');
    });

    test('should have search input', async ({ page }) => {
        await page.goto('/library');

        await expect(page.getByPlaceholder(/search/i)).toBeVisible();
    });

    test('should have add new song button', async ({ page }) => {
        await page.goto('/library');

        await expect(page.getByRole('link', { name: /add.*song|new/i })).toBeVisible();
    });
});

test.describe('Session (Authenticated)', () => {
    test('should show Go Live button for logged in users', async ({ page }) => {
        await page.goto('/session');

        // Authenticated users should see Go Live
        await expect(page.getByRole('button', { name: /go live/i })).toBeVisible();
    });
});
