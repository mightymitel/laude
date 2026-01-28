import { resursecrestineScraper } from '../../scrapers/resursecrestine.js';

describe('resursecrestineScraper', () => {
    describe('canHandle', () => {
        it('should handle resursecrestine.ro acorduri URLs', () => {
            expect(resursecrestineScraper.canHandle('https://www.resursecrestine.ro/acorduri/154992/el-este-domn')).toBe(true);
            expect(resursecrestineScraper.canHandle('https://resursecrestine.ro/acorduri/96109/leul-din-iuda')).toBe(true);
        });

        it('should not handle non-acorduri URLs', () => {
            expect(resursecrestineScraper.canHandle('https://www.resursecrestine.ro/cantece/123')).toBe(false);
            expect(resursecrestineScraper.canHandle('https://example.com/acorduri/123')).toBe(false);
        });

        it('should not handle invalid URLs', () => {
            expect(resursecrestineScraper.canHandle('not-a-url')).toBe(false);
        });
    });

    describe('scrape', () => {
        const originalFetch = global.fetch;

        beforeEach(() => {
            // Mock fetch
            global.fetch = jest.fn();
        });

        afterEach(() => {
            global.fetch = originalFetch;
        });

        it('should scrape "El este Domn" correctly', async () => {
            // Mock HTML based on example 1
            const mockHtml = `
                <html>
                <head>
                    <title>El este Domn și în ceruri domnește - Resurse Creștine</title>
                    <meta name="description" content="Ekklesia, fara album - acorduri: E">
                </head>
                <body>
                    <a href="/acorduri/index-autori/ekklesia">Ekklesia</a>
                    <span class="stil-acorduri">
                        <a class="nice-acord" rel="E">E</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="E">E</a><br/>
                        El este Domn si in ceruri domneste,<br/>
                        <a class="nice-acord" rel="B">B</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="E">E</a><br/>
                        El este Domn.<br/>
                        <br/>
                        &nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="E">E</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="E">E</a><br/>
                        Lumina-I creata cand El porunceste!<br/>
                        <a class="nice-acord" rel="B">B</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="E">E</a><br/>
                        El este Domn.<br/>
                    </span>
                </body>
                </html>
            `;

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockHtml),
            });

            const result = await resursecrestineScraper.scrape('https://www.resursecrestine.ro/acorduri/154992/el-este-domn');

            expect(result.title).toBe('El este Domn și în ceruri domnește');
            expect(result.originalKey).toBe('E');
            expect(result.parts.length).toBeGreaterThan(0);

            // First part should be verse
            const firstPart = result.parts[0];
            expect(firstPart).toBeDefined();
            expect(firstPart?.type).toBe('verse');

            // Check that lines have chords embedded (Nashville notation: E=1, A=4 in key of E)
            const firstLine = firstPart?.lines[0];
            expect(firstLine?.text).toContain('[1]');
            expect(firstLine?.text).toContain('[4]');
        });

        it('should scrape "Leul din Iuda" correctly', async () => {
            // Mock HTML based on example 2
            const mockHtml = `
                <html>
                <head>
                    <title>Leul din Iuda - Resurse Creștine</title>
                    <meta name="description" content="Sunny, album - acorduri: D">
                </head>
                <body>
                    <a href="/acorduri/index-autori/sunny">Sunny</a>
                    <span class="stil-acorduri">
                        <a class="nice-acord" rel="b">b</a><br/>
                        Hai spune-mi cine a biruit moartea,<br/>
                        <a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="D">D</a><br/>
                        cine a calcat peste ea?<br/>
                        <a class="nice-acord" rel="b">b</a><br/>
                        Cine e Leul din Iuda,<br/>
                        <a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="b">b</a><br/>
                        scutul taria mea?<br/>
                        <br/>
                        R:<br/>
                        <a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="D">D</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a><br/>
                        Aleluia Aleluia Aleluia<br/>
                    </span>
                </body>
                </html>
            `;

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockHtml),
            });

            const result = await resursecrestineScraper.scrape('https://www.resursecrestine.ro/acorduri/96109/leul-din-iuda');

            expect(result.title).toBe('Leul din Iuda');
            expect(result.parts.length).toBeGreaterThan(0);

            // Should have verses and a chorus
            const partTypes = result.parts.map((p: { type: string }) => p.type);
            expect(partTypes).toContain('verse');
            expect(partTypes).toContain('chorus');

            // Check verse has chords
            const verse = result.parts.find((p: { type: string }) => p.type === 'verse');
            expect(verse?.lines.some((l: { text: string }) => l.text.includes('['))).toBe(true);
        });

        it('should parse plain text chords on chord-dense lines', async () => {
            // Test case for plain text chords (not wrapped in nice-acord tags)
            const mockHtml = `
                <html>
                <head>
                    <title>Test Song - Resurse Creștine</title>
                </head>
                <body>
                    <span class="stil-acorduri">
                        &nbsp;b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br />
                        Hai spune-mi cine a biruit moartea,<br />
                        &nbsp;&nbsp;<a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="D">D</a>&nbsp;<br />
                        cine a calcat peste ea?<br />
                        &nbsp;b<br />
                        Cine e Leul din Iuda,<br />
                        &nbsp;<a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;&nbsp;&nbsp;b<br />
                        scutul taria mea?<br />
                    </span>
                </body>
                </html>
            `;

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockHtml),
            });

            const result = await resursecrestineScraper.scrape('https://www.resursecrestine.ro/acorduri/96109/test');

            // Should detect "b" as a chord even though it's plain text
            const allLines = result.parts.flatMap(p => p.lines).map(l => l.text);
            const hasPlainTextBChord = allLines.some(line => line.includes('[') && line.toLowerCase().includes('b'));

            expect(hasPlainTextBChord).toBe(true);
        });

        it('should handle fetch errors', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
            });

            await expect(resursecrestineScraper.scrape('https://www.resursecrestine.ro/acorduri/99999/not-found'))
                .rejects.toThrow('Failed to fetch');
        });
    });
});
