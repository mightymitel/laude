
import { spawn } from 'child_process';
import { createServer } from 'net';

// Helper to find a free port
const getFreePort = (): Promise<number> => {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.listen(0, () => {
            const address = server.address();
            const port = address && typeof address === 'object' ? address.port : 0;
            server.close(() => resolve(port));
        });
        server.on('error', reject);
    });
};

async function run() {
    try {
        // Find two free ports
        const apiPort = await getFreePort();
        // Ensure they are different
        let webPort = await getFreePort();
        while (webPort === apiPort) {
            webPort = await getFreePort();
        }

        console.log(`[E2E Setup] Selected ports - API: ${apiPort}, Web: ${webPort}`);

        // Set env vars for Playwright
        const env = {
            ...process.env,
            TEST_API_PORT: apiPort.toString(),
            TEST_WEB_PORT: webPort.toString(),
            // Ensure web app points to the correct API port
            VITE_API_URL: `http://127.0.0.1:${apiPort}`,
            // Force CI mode to avoid opening browser if not requested (optional)
            CI: process.env.CI || 'true',
        };

        console.log('[E2E Setup] Starting Playwright...');

        // Spawn Playwright
        // We pass the args through to allow filtering (e.g. npx tsx scripts/e2e-runner.ts test tests/e2e/foo.spec.ts)
        const args = process.argv.slice(2);
        const playwright = spawn('npx', ['playwright', 'test', ...args], {
            env,
            stdio: 'inherit',
            shell: true,
        });

        playwright.on('close', (code) => {
            console.log(`[E2E Setup] Playwright finished with code ${code}`);
            process.exit(code || 0);
        });

    } catch (error) {
        console.error('[E2E Setup] Failed:', error);
        process.exit(1);
    }
}

run();
