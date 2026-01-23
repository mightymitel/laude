import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.TEST_API_PORT || '3001';
const WEB_PORT = process.env.TEST_WEB_PORT || '5173';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: `http://127.0.0.1:${WEB_PORT}`,
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
            command: `PORT=${API_PORT} npm run dev -w apps/api`,
            url: `http://127.0.0.1:${API_PORT}/health`,
            reuseExistingServer: !process.env.CI, // Always reuse in dev, start fresh in CI/Test Runner
            timeout: 30000,
        },
        {
            command: `VITE_API_URL=http://127.0.0.1:${API_PORT} npm run dev -w apps/web -- --port ${WEB_PORT} --strictPort`,
            url: `http://127.0.0.1:${WEB_PORT}`,
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
        },
    ],
});
