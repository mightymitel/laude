/**
 * Server-rendered link previews (WP-160). Message scrapers don't run JS, so
 * the SPA previews blank; this process (always-warm App Hosting, same one
 * that owns the relay) templates per-route Open Graph / Twitter tags into
 * index.html for ALL requests — no crawler user-agent sniffing.
 *
 * The web build wraps its default tags in the WP-160 comment markers; the
 * server swaps that block. A route with no special preview serves the file
 * untouched.
 */
export interface OgTags {
    title: string;
    description: string;
}

export interface PreviewDeps {
    /** Active-session lookups — same process as the relay, no I/O. */
    sessionByAccessCode(code: string): { ownerId: string; status: string } | null;
    sessionByPresenterCode(code: string): { ownerId: string; status: string } | null;
    /** Owner display name from the users collection (uid-keyed, WP-113). */
    ownerName(uid: string): Promise<string | null>;
    /** Song metadata IF the song is public/official — private stays private. */
    publicSong(id: string): Promise<{ title: string; author: string | null } | null>;
}

const ENDED: OgTags = {
    title: 'This session has ended',
    description: 'The worship session you were invited to has finished. — Laudasist',
};

export async function previewForPath(path: string, deps: PreviewDeps): Promise<OgTags | null> {
    const viewer = path.match(/^\/view\/([A-Za-z0-9-]+)\/?$/);
    if (viewer) {
        const session = deps.sessionByAccessCode(viewer[1]!);
        if (!session) return ENDED;
        const owner = (await deps.ownerName(session.ownerId)) ?? 'A worship leader';
        return {
            title: `${owner}'s worship session is live — join now`,
            description: 'Follow the lyrics live on your phone. — Laudasist',
        };
    }

    const presenter = path.match(/^\/present\/([A-Za-z0-9-]+)\/?$/);
    if (presenter) {
        const session = deps.sessionByPresenterCode(presenter[1]!);
        if (!session) return ENDED;
        const owner = (await deps.ownerName(session.ownerId)) ?? 'A worship leader';
        return {
            title: `${owner} asked you to present in their worship session`,
            description: 'Open the link to drive lyrics for the room. — Laudasist',
        };
    }

    const song = path.match(/^\/library\/([A-Za-z0-9_-]+)\/?$/);
    if (song && song[1] !== 'new') {
        const meta = await deps.publicSong(song[1]!);
        if (!meta) return null; // private/unknown → the branded default
        return {
            title: `${meta.title}${meta.author ? ` — ${meta.author}` : ''} · on Laudasist`,
            description: 'Lyrics and chords on Laudasist.',
        };
    }

    return null;
}

const MARKER = /<!-- Default social tags[\s\S]*?<title>[\s\S]*?<\/title>/;

/**
 * Swap the default tag block (marker comment through </title>) for the
 * per-route one. `baseUrl` makes og:image absolute — scrapers require it.
 */
export function renderIndexHtml(indexHtml: string, tags: OgTags | null, baseUrl: string, path: string): string {
    const title = tags?.title ?? 'Laudasist';
    const description = tags?.description ?? 'Worship songs, live sessions, chords & lyrics';
    const block = [
        `<meta property="og:title" content="${escapeHtml(title)}" />`,
        `<meta property="og:description" content="${escapeHtml(description)}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta property="og:url" content="${escapeHtml(baseUrl + path)}" />`,
        `<meta property="og:image" content="${escapeHtml(baseUrl)}/icons/og-default.png" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<title>${escapeHtml(title)}</title>`,
    ].join('\n    ');
    return indexHtml.replace(MARKER, block);
}

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}
