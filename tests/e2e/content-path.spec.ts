/**
 * The demo's content path (B2/B3 — DEC-106/107/108): a song saved through the
 * importer/editor route lands PRIVATE with a degree chart in song_lyrics,
 * is searchable by its owner only, and the owner's publish flip makes it
 * findable by everyone (DEC-39: presenters search public) — all against the
 * emulator, no external scraping.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';

const API_URL = `http://localhost:${process.env.TEST_API_PORT || '3001'}`;
const AUTH_URL = 'http://127.0.0.1:9099';

async function idToken(request: APIRequestContext): Promise<string> {
    const res = await request.post(
        `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
        { data: { email: 'testuser@test.com', password: '12345678', returnSecureToken: true } },
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    return body.idToken as string;
}

// A distinctive lyric no seed song contains.
const LYRIC = 'cararea importului verificat';

test.describe('content path: import-save → private → publish → public search', () => {
    test('save lands private with a degree chart; publish makes it publicly searchable', async ({ request }) => {
        const token = await idToken(request);
        const auth = { Authorization: `Bearer ${token}` };

        // 1. Save (what the importer/editor posts): degree tokens in parts.
        const created = await request.post(`${API_URL}/api/songs`, {
            headers: auth,
            data: {
                title: 'Cântec importat de test',
                author: 'e2e',
                defaultKey: 'G',
                parts: [
                    {
                        id: 'V1',
                        type: 'verse',
                        index: 1,
                        lines: [{ text: `[1]${LYRIC} [4]aici` }, { text: '[5]a doua [1]linie' }],
                    },
                ],
            },
        });
        expect(created.status()).toBe(201);
        const songId = (await created.json()).id as string;

        // 2. Private by default (DEC-108): anonymous search cannot see it…
        const anonBefore = await request.get(
            `${API_URL}/api/search/lyrics?q=${encodeURIComponent('cararea importului')}`,
        );
        expect(anonBefore.ok()).toBeTruthy();
        expect((await anonBefore.json()).results).toHaveLength(0);

        // …but the owner can (and the snippet proves the song_lyrics degree
        // chart was written: search snippets come from the chordpro doc).
        const ownerSearch = await request.get(
            `${API_URL}/api/search/lyrics?q=${encodeURIComponent('cararea importului')}`,
            { headers: auth },
        );
        const ownerResults = (await ownerSearch.json()).results as {
            song_id: string;
            visibility: string;
            snippet: string;
        }[];
        expect(ownerResults.map((r) => r.song_id)).toContain(songId);
        const mine = ownerResults.find((r) => r.song_id === songId)!;
        expect(mine.visibility).toBe('private');
        expect(mine.snippet).toContain(LYRIC);
        expect(mine.snippet, 'snippet is singable text, chords stripped').not.toContain('[1]');

        // 3. Publish to community (DEC-108): owner-only visibility flip.
        const published = await request.put(`${API_URL}/api/songs/${songId}`, {
            headers: auth,
            data: { visibility: 'public' },
        });
        expect(published.ok()).toBeTruthy();

        // 4. Now the anonymous (presenter/viewer) search finds it.
        const anonAfter = await request.get(
            `${API_URL}/api/search/lyrics?q=${encodeURIComponent('cararea importului')}`,
        );
        const publicResults = (await anonAfter.json()).results as { song_id: string }[];
        expect(publicResults.map((r) => r.song_id)).toContain(songId);

        // 5. Delete cleans up the denormalized chart too: owner search stops
        // finding it (the index rebuilt from songs + song_lyrics).
        const deleted = await request.delete(`${API_URL}/api/songs/${songId}`, { headers: auth });
        expect(deleted.ok()).toBeTruthy();
        const afterDelete = await request.get(
            `${API_URL}/api/search/lyrics?q=${encodeURIComponent('cararea importului')}`,
            { headers: auth },
        );
        expect((await afterDelete.json()).results).toHaveLength(0);
    });
});
