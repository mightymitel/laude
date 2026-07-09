import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createServer, connect } from 'net';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

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

const isPortOpen = (port: number): Promise<boolean> =>
    new Promise((resolve) => {
        const socket = connect({ port, host: '127.0.0.1' }, () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.setTimeout(1000, () => {
            socket.destroy();
            resolve(false);
        });
    });

const waitForPort = async (port: number, timeoutMs = 60000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortOpen(port)) return;
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`port ${port} not reachable after ${timeoutMs}ms`);
};

/**
 * The installed @playwright/test may expect a chromium revision that isn't
 * installable on this OS; use any cached chromium build instead when present.
 */
function findChromium(): string | undefined {
    if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
    const cache = join(homedir(), '.cache', 'ms-playwright');
    for (const dir of ['chromium-1228', 'chromium-1200']) {
        const bin = join(cache, dir, 'chrome-linux64', 'chrome');
        if (existsSync(bin)) return bin;
    }
    return undefined;
}

async function run() {
    let emulator: ChildProcess | null = null;
    try {
        const apiPort = await getFreePort();
        let webPort = await getFreePort();
        while (webPort === apiPort) {
            webPort = await getFreePort();
        }
        let relayPort = await getFreePort();
        while (relayPort === apiPort || relayPort === webPort) {
            relayPort = await getFreePort();
        }

        console.log(`[E2E Setup] Ports - API: ${apiPort}, Web: ${webPort}, Relay: ${relayPort}`);

        // --- Firebase emulator (auth 9099 + firestore 8080): reuse or start ---
        const emulatorUp = (await isPortOpen(8080)) && (await isPortOpen(9099));
        if (!emulatorUp) {
            console.log('[E2E Setup] Starting the Firebase emulator (auth + firestore)…');
            emulator = spawn('firebase', ['emulators:start', '--project', 'demo-laude', '--only', 'auth,firestore'], {
                stdio: 'ignore',
                shell: true,
                detached: true,
            });
            await waitForPort(8080, 90000);
            await waitForPort(9099, 90000);
        } else {
            console.log('[E2E Setup] Reusing the running Firebase emulator');
        }

        const emulatorEnv = {
            FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
            FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
            FIREBASE_PROJECT_ID: 'demo-laude',
        };

        // --- Seed the e2e fixtures (idempotent) ---
        console.log('[E2E Setup] Seeding e2e fixtures…');
        const seed = spawnSync('npx', ['tsx', 'scripts/seed-e2e.ts'], {
            env: { ...process.env, ...emulatorEnv },
            stdio: 'inherit',
            shell: true,
        });
        if (seed.status !== 0) throw new Error('seed-e2e failed');

        const chromium = findChromium();
        if (chromium) console.log(`[E2E Setup] Using chromium at ${chromium}`);

        // Set env vars for Playwright
        const env = {
            ...process.env,
            ...emulatorEnv,
            TEST_API_PORT: apiPort.toString(),
            TEST_WEB_PORT: webPort.toString(),
            TEST_RELAY_PORT: relayPort.toString(),
            VITE_API_URL: `http://localhost:${apiPort}`,
            VITE_RELAY_URL: `http://localhost:${relayPort}`,
            ...(chromium ? { PLAYWRIGHT_CHROMIUM_PATH: chromium } : {}),
            CI: process.env.CI || 'true',
        };

        console.log('[E2E Setup] Starting Playwright...');
        // We pass the args through to allow filtering (e.g. npx tsx scripts/e2e-runner.ts tests/e2e/foo.spec.ts)
        const args = process.argv.slice(2);
        const playwright = spawn('npx', ['playwright', 'test', ...args], {
            env,
            stdio: 'inherit',
            shell: true,
        });

        playwright.on('close', (code) => {
            console.log(`[E2E Setup] Playwright finished with code ${code}`);
            if (emulator?.pid) {
                try {
                    process.kill(-emulator.pid, 'SIGINT');
                } catch {
                    // best-effort — we may not own the process group
                }
            }
            process.exit(code || 0);
        });
    } catch (error) {
        console.error('[E2E Setup] Failed:', error);
        if (emulator?.pid) {
            try {
                process.kill(-emulator.pid, 'SIGINT');
            } catch {
                // best-effort
            }
        }
        process.exit(1);
    }
}

run();
