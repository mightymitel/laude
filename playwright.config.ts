import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.TEST_API_PORT || '3001';
const WEB_PORT = process.env.TEST_WEB_PORT || '5173';
const RELAY_PORT = process.env.TEST_RELAY_PORT || '3003';

// The whole stack runs against the Firebase EMULATOR (never real data);
// scripts/e2e-runner.ts boots it, seeds fixtures and picks free ports.
const EMULATOR_ENV =
    'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-laude';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: `http://localhost:${WEB_PORT}`,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Optional override when the pinned chromium revision can't be
                // installed on this OS (set by scripts/e2e-runner.ts).
                launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
                    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
                    : {},
            },
        },
    ],
    webServer: [
        {
            command: `${EMULATOR_ENV} PORT=${API_PORT} npm run dev -w apps/api`,
            url: `http://localhost:${API_PORT}/health`,
            reuseExistingServer: !process.env.CI, // Always reuse in dev, start fresh in CI/Test Runner
            timeout: 30000,
        },
        {
            command: `${EMULATOR_ENV} RELAY_PORT=${RELAY_PORT} npm run dev -w apps/relay`,
            url: `http://localhost:${RELAY_PORT}/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
        },
        {
            command: `VITE_API_URL=http://localhost:${API_PORT} VITE_RELAY_URL=http://localhost:${RELAY_PORT} npm run dev -w apps/web -- --port ${WEB_PORT} --strictPort`,
            url: `http://localhost:${WEB_PORT}`,
            reuseExistingServer: !process.env.CI,
            timeout: 30000,
        },
    ],
});
