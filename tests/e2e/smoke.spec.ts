
import { test, expect } from '@playwright/test';

test('smoke test - homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/LaudAsist|Worship|web/);
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
