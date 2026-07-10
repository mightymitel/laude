/**
 * E1 — the app-shell conversion path: the personal session survives reloads
 * AND the sign-in round-trip (guest builds a set → save prompt → /login →
 * back on /session with the set intact, now able to save).
 */
import { test, expect } from '@playwright/test';

const TEST_USER = { email: 'testuser@test.com', password: '12345678' };

const PERSONAL_SLICE = {
    current: { song_id: 'guest-song-1', section_index: 0, key: 'E', tempo_pct: 100, blank: false },
    currentSong: {
        id: 'guest-song-1',
        title: 'Cântarea oaspetelui',
        defaultKey: 'E',
        parts: [{ id: 'V1', type: 'verse', index: 0, lines: [{ text: '[1]Bun venit [4]acasă' }] }],
    },
    sessionPlaylist: [
        {
            id: 'g1',
            songId: 'guest-song-1',
            key: 'E',
            song: {
                id: 'guest-song-1',
                title: 'Cântarea oaspetelui',
                defaultKey: 'E',
                parts: [{ id: 'V1', type: 'verse', index: 0, lines: [{ text: '[1]Bun venit [4]acasă' }] }],
            },
        },
    ],
};

test('guest set survives reload and the sign-in moment, then saves (Flow 1 conversion)', async ({ page }) => {
    // A guest's working session, as the durable slice the hook persists.
    await page.goto('/session?guest=true');
    await page.evaluate(
        (slice) => localStorage.setItem('laudasist.personalSession', JSON.stringify(slice)),
        PERSONAL_SLICE,
    );

    // Reload: the personal session re-seeds from the persisted slice.
    await page.reload();
    await expect(page.getByText('Cântarea oaspetelui').first()).toBeVisible();

    // The save moment: confirm the sign-in prompt → /login?redirect=session.
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('save-session').click();
    await page.waitForURL(/\/login/);

    // Sign in; the redirect lands back on /session…
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/session/);

    // …with the guest's set intact (prefs and set are per-device state).
    await expect(page.getByText('Cântarea oaspetelui').first()).toBeVisible();

    // And now the save works: name prompt → saved notice.
    page.once('dialog', (dialog) => void dialog.accept('Seara convertitului'));
    await page.getByTestId('save-session').click();
    await expect(page.getByText(/Saved "Seara convertitului"/)).toBeVisible({ timeout: 10000 });
});
