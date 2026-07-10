/**
 * Flow 3's persisted session, narrow (DEC-96/99): save a named session with
 * a by-value playlist, list it, keep it owner-only, and open it back into
 * /session where the set is ready and Go Live still works.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const API_URL = `http://localhost:${process.env.TEST_API_PORT || '3001'}`;
const AUTH_URL = 'http://127.0.0.1:9099';

const TEST_USER = { email: 'testuser@test.com', password: '12345678' };

async function idToken(
    request: APIRequestContext,
    email: string,
    password: string,
    create = false,
): Promise<string> {
    const verb = create ? 'accounts:signUp' : 'accounts:signInWithPassword';
    const res = await request.post(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/${verb}?key=demo-key`, {
        data: { email, password, returnSecureToken: true },
    });
    expect(res.ok()).toBeTruthy();
    return (await res.json()).idToken as string;
}

async function login(page: Page) {
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|session)/);
}

const BY_VALUE_ITEM = {
    id: 'item-1',
    songId: 'saved-song-1',
    key: 'D',
    song: {
        id: 'saved-song-1',
        title: 'Cântecul serii salvate',
        defaultKey: 'D',
        parts: [
            { id: 'V1', type: 'verse', index: 0, lines: [{ text: '[1]Seara [4]vine' }] },
        ],
    },
};

test.describe('persisted session (narrow, DEC-96)', () => {
    test('save → list → owner-only → open into /session → Go Live', async ({ page, request }) => {
        const token = await idToken(request, TEST_USER.email, TEST_USER.password);
        const auth = { Authorization: `Bearer ${token}` };

        // Save a session with a by-value item.
        const created = await request.post(`${API_URL}/api/saved-sessions`, {
            headers: auth,
            data: { name: 'Seara de e2e', items: [BY_VALUE_ITEM] },
        });
        expect(created.status()).toBe(201);
        const saved = await created.json();
        expect(saved.ownerId).toBeTruthy();

        // It shows up in "my sessions".
        const list = await request.get(`${API_URL}/api/saved-sessions`, { headers: auth });
        const mine = (await list.json()) as { id: string; name: string }[];
        expect(mine.map((s) => s.id)).toContain(saved.id);

        // A different account cannot read it (items may embed private songs).
        const stranger = await idToken(request, `stranger-${Date.now()}@test.local`, 'parola-straina', true);
        const denied = await request.get(`${API_URL}/api/saved-sessions/${saved.id}`, {
            headers: { Authorization: `Bearer ${stranger}` },
        });
        expect(denied.status()).toBe(403);

        // Anonymous cannot list.
        const anon = await request.get(`${API_URL}/api/saved-sessions`);
        expect(anon.status()).toBe(401);

        // Open it in the session page: the by-value set is ready to lead.
        await login(page);
        await page.goto(`/session?savedSessionId=${saved.id}`);
        await expect(page.getByText('Cântecul serii salvate').first()).toBeVisible();
        // The save verb switches to updating THIS session.
        await expect(page.getByTestId('save-session')).toContainText('Update');
        // And going live still works from a reopened session (repeatable).
        await page.locator('button:has-text("Go Live")').click();
        await expect(page.getByText(/Share|viewer/i).first()).toBeVisible({ timeout: 10000 });

        // Cleanup keeps reruns honest (unique emails, but the doc would linger).
        const deleted = await request.delete(`${API_URL}/api/saved-sessions/${saved.id}`, { headers: auth });
        expect(deleted.status()).toBe(204);
    });
});
