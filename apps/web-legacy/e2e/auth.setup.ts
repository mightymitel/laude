import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = 'test-output/.auth/user.json';

// Test account credentials - set these in environment or here
const TEST_EMAIL = process.env.E2E_TEST_EMAIL || 'testuser@test.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || '12345678';

/**
 * This setup test authenticates via email/password and saves the session.
 * 
 * Set up a test account first, then set env vars:
 *   E2E_TEST_EMAIL=your-test@email.com
 *   E2E_TEST_PASSWORD=yourpassword
 * 
 * Or create the account manually and update the defaults above.
 */
setup('authenticate', async ({ page }) => {
    // Ensure auth directory exists
    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
    }

    // Navigate to login page
    await page.goto('/login');

    // Wait for page to load
    await expect(page.locator('h1')).toContainText(/Welcome Back|Create Account/);

    console.log(`Logging in with email: ${TEST_EMAIL}`);

    // Fill in email and password
    await page.locator('#email').fill(TEST_EMAIL);
    await page.locator('#password').fill(TEST_PASSWORD);

    // Click sign in button
    await page.getByRole('button', { name: /sign in/i }).click();

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/dashboard/, { timeout: 30000 });

    console.log('Authentication complete!');

    // Save signed-in state
    await page.context().storageState({ path: authFile });
    console.log(`Auth state saved to ${authFile}`);
});
