/** WP-160: per-route OG previews — messages, ended-session fallback, templating. */
import { previewForPath, renderIndexHtml, type PreviewDeps } from '../../preview/linkPreview';

const INDEX = `<!doctype html><head>
    <meta name="description" content="d" />
    <!-- Default social tags; the server overrides these per-route (WP-160). -->
    <meta property="og:title" content="Laudasist" />
    <meta property="og:description" content="d" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="/icons/og-default.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <title>Laudasist</title>
    <script src="/assets/app.js"></script></head>`;

function deps(overrides: Partial<PreviewDeps> = {}): PreviewDeps {
    return {
        sessionByAccessCode: () => ({ ownerId: 'uid-1', status: 'active' }),
        sessionByPresenterCode: () => ({ ownerId: 'uid-1', status: 'active' }),
        ownerName: async () => 'Mitel',
        publicSong: async () => ({ title: 'Amazing Grace', author: 'John Newton' }),
        ...overrides,
    };
}

describe('previewForPath', () => {
    it('viewer link of a live session names the owner', async () => {
        const tags = await previewForPath('/view/ABC123', deps());
        expect(tags?.title).toBe("Mitel's worship session is live — join now");
    });

    it('presenter link asks on behalf of the owner', async () => {
        const tags = await previewForPath('/present/XYZ789', deps());
        expect(tags?.title).toBe('Mitel asked you to present in their worship session');
    });

    it('ended or invalid session previews as ended, not a dead invite', async () => {
        const d = deps({ sessionByAccessCode: () => null, sessionByPresenterCode: () => null });
        expect((await previewForPath('/view/GONE', d))?.title).toBe('This session has ended');
        expect((await previewForPath('/present/GONE', d))?.title).toBe('This session has ended');
    });

    it('missing owner profile falls back to a generic leader', async () => {
        const tags = await previewForPath('/view/ABC123', deps({ ownerName: async () => null }));
        expect(tags?.title).toBe("A worship leader's worship session is live — join now");
    });

    it('public song → "{Title} — {Author} · on Laudasist"; private → default', async () => {
        expect((await previewForPath('/library/song-1', deps()))?.title).toBe(
            'Amazing Grace — John Newton · on Laudasist',
        );
        expect(await previewForPath('/library/song-1', deps({ publicSong: async () => null }))).toBeNull();
        expect(await previewForPath('/library/new', deps())).toBeNull();
    });

    it('unrelated routes keep the default tags', async () => {
        expect(await previewForPath('/dashboard', deps())).toBeNull();
        expect(await previewForPath('/', deps())).toBeNull();
    });
});

describe('renderIndexHtml', () => {
    it('replaces the default block, absolutizes the image and escapes content', () => {
        const html = renderIndexHtml(
            INDEX,
            { title: 'A & B <live>', description: 'join "now"' },
            'https://laudasist.ro',
            '/view/ABC123',
        );
        expect(html).toContain('<meta property="og:title" content="A &amp; B &lt;live&gt;" />');
        expect(html).toContain('<meta property="og:description" content="join &quot;now&quot;" />');
        expect(html).toContain('<meta property="og:image" content="https://laudasist.ro/icons/og-default.png" />');
        expect(html).toContain('<meta property="og:url" content="https://laudasist.ro/view/ABC123" />');
        expect(html).toContain('<title>A &amp; B &lt;live&gt;</title>');
        expect(html).not.toContain('<title>Laudasist</title>');
        expect(html).toContain('<script src="/assets/app.js">'); // rest untouched
    });

    it('null tags render the branded default with an absolute image', () => {
        const html = renderIndexHtml(INDEX, null, 'https://laudasist.ro', '/dashboard');
        expect(html).toContain('<title>Laudasist</title>');
        expect(html).toContain('https://laudasist.ro/icons/og-default.png');
    });
});
