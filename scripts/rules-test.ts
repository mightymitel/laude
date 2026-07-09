/**
 * Firestore rules test runner (WP-121): reuse a running firestore emulator on
 * :8080 or boot one, run the rules suite, tear down what we started.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';

function isPortOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host: '127.0.0.1' });
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('error', () => resolve(false));
        setTimeout(() => {
            socket.destroy();
            resolve(false);
        }, 1000);
    });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isPortOpen(port)) return;
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`firestore emulator not reachable on :${port}`);
}

async function main(): Promise<void> {
    let emulator: ChildProcess | null = null;
    const alreadyUp = await isPortOpen(8080);
    if (!alreadyUp) {
        console.log('[rules-test] starting the firestore emulator…');
        emulator = spawn('firebase', ['emulators:start', '--project', 'demo-laude-rules', '--only', 'firestore'], {
            stdio: 'ignore',
            detached: true,
        });
        await waitForPort(8080, 60_000);
    } else {
        console.log('[rules-test] reusing the running firestore emulator on :8080');
    }

    const result = spawnSync('npx', ['tsx', '--test', 'tests/rules/firestore-rules.test.ts'], {
        stdio: 'inherit',
    });

    if (emulator?.pid) {
        process.kill(-emulator.pid, 'SIGTERM');
    }
    process.exit(result.status ?? 1);
}

main().catch((err) => {
    console.error('[rules-test] failed:', err);
    process.exit(1);
});
