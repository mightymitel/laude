
import { test, expect } from '@playwright/test';

test('smoke test - homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Laudasist/);
});

test('route crash renders the recoverable error boundary, not a white screen (WP-125)', async ({ page }) => {
    // The DEV-only injector at the top of the view route reads sessionStorage.
    await page.addInitScript(() => sessionStorage.setItem('laudasist.devCrash', '1'));
    await page.goto('/view/ANYCODE');
    await expect(page.getByTestId('error-fallback')).toBeVisible({ timeout: 10000 });
    // Recover: clear the flag, retry → the route renders normally.
    await page.evaluate(() => sessionStorage.removeItem('laudasist.devCrash'));
    await page.getByTestId('error-retry').click();
    await expect(page.getByTestId('error-fallback')).not.toBeVisible({ timeout: 10000 });
    await expect(page.locator('body')).toContainText(/Session not found|Connecting/);
});

test('library page renders for a signed-in user (regression: React #310)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'testuser@test.com');
    await page.fill('input[type="password"]', '12345678');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|session)/);
    await page.goto('/library');
    await expect(page.getByRole('heading', { name: 'Library', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Something went wrong')).not.toBeVisible();
});
