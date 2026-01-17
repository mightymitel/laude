import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:5174',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            command: 'npm run dev -w apps/api',
            url: 'http://localhost:3001/health',
            reuseExistingServer: true,
            timeout: 30000,
        },
        {
            command: 'npm run dev -w apps/web',
            url: 'http://localhost:5174',
            reuseExistingServer: true,
            timeout: 30000,
        },
    ],
});
