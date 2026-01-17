import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        // Setup project - run first to authenticate
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
        },
        // Public tests - no auth required (guest mode, landing page)
        {
            name: 'public',
            testMatch: /session\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        // Authenticated tests - use saved auth state
        {
            name: 'authenticated',
            testMatch: /authenticated\.spec\.ts/,
            use: {
                ...devices['Desktop Chrome'],
                storageState: 'test-output/.auth/user.json',
            },
        },
    ],
    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
