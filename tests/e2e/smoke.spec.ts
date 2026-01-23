
import { test, expect } from '@playwright/test';

test('smoke test - homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/LaudAsist|Worship|web/);
});
