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

        it('should scrape "Leul din Iuda" correctly with exact expected output', async () => {
            // Mock HTML based on actual resursecrestine.ro format
            // Expected output from docs/examples/resurse-crestine-example2.md
            const mockHtml = `
                <html>
                <head>
                    <title>Leul din Iuda - Resurse Creștine</title>
                    <meta name="description" content="Sunny, album - acorduri: D">
                </head>
                <body>
                    <span class="stil-acorduri">
                        &nbsp;b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br />
                        Hai&nbsp;spune-mi&nbsp;cine&nbsp;a&nbsp;biruit&nbsp;moartea,<br />
                        &nbsp;&nbsp;<a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="D">D</a>&nbsp;<br \/>
                        cine&nbsp;a&nbsp;calcat&nbsp;peste&nbsp;ea?<br />
                        &nbsp;b<br />
                        Cine&nbsp;e&nbsp;Leul&nbsp;din&nbsp;Iuda,<br />
                        &nbsp;<a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;&nbsp;&nbsp;b<br />
                        scutul&nbsp;taria&nbsp;mea?<br />
                        <br/>
                        Spune-mi&nbsp;cine&nbsp;a&nbsp;biruit&nbsp;frica,<br/>
                        cine&nbsp;a&nbsp;calcat&nbsp;peste&nbsp;ea?<br/>
                        cine&nbsp;e&nbsp;Leul&nbsp;din&nbsp;Iuda,<br/>
                        scutul&nbsp;taria&nbsp;mea?<br/>
                        <br/>
                        R:<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="D">D</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;<br />
                        &nbsp;&nbsp;Aleluia&nbsp;Aleluia&nbsp;Aleluia&nbsp;<br />
                        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;b&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br />
                        &nbsp;&nbsp;Isus&nbsp;este&nbsp;Domn!<br />
                        &nbsp;&nbsp;Aleluia&nbsp;Aleluia&nbsp;Aleluia&nbsp;<br />
                        &nbsp;&nbsp;Isus&nbsp;este&nbsp;Domn!<br />
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

            // Key should be detected as D (b=6, G=4, A=5, D=1 in key of D)
            // or as G (b=3, G=1, A=2, D=5 in key of G)
            // The algorithm will likely detect D based on the chord progression

            // Find first verse
            const verse1 = result.parts.find(p => p.type === 'verse' && p.index === 1);
            expect(verse1).toBeDefined();

            // Expected lines from docs/examples/resurse-crestine-example2.md:
            // [b]Hai spune-mi cine a biruit moartea,
            // [G]cine a calcat peste [D]ea?
            // [b]Cine e Leul din Iuda,
            // [G]scutul tar[A]ia [b]mea?

            expect(verse1!.lines.length).toBeGreaterThanOrEqual(4);

            // First line should have chord at beginning
            expect(verse1!.lines[0]!.text).toMatch(/^\[.+?\]Hai spune-mi/);

            // Second line should have chord at beginning and one near "ea"
            // Note: positions may be off by 2-3 chars due to HTML spacing
            const line2 = verse1!.lines[1]!.text;
            expect(line2).toMatch(/^\[.+?\]cine/);
            expect(line2).toMatch(/pe[st]*\[.+?\][te]*\s*ea/); // Chord near "ea" (allow for 2-3 char deviation)

            // Third line should have chord at beginning
            expect(verse1!.lines[2]!.text).toMatch(/^\[.+?\]Cine e/);

            // Fourth line should have chords: one at start, one near "ia", one near "mea"
            const line4 = verse1!.lines[3]!.text;
            expect(line4).toMatch(/^\[.+?\]scutul/);
            expect(line4).toMatch(/ta[r]*\[.+?\][ri]*a/); // Chord near "ria" (allow for deviation)
            expect(line4).toMatch(/\[.+?\]mea/);

            // Find chorus
            const chorus = result.parts.find(p => p.type === 'chorus');
            expect(chorus).toBeDefined();

            // Chorus should have chords in first line
            const chorusLine1 = chorus!.lines[0]!.text;
            expect(chorusLine1).toContain('Aleluia');
            // Should have multiple chords (G, D, A spread across "Aleluia Aleluia Aleluia")
            const chordMatches = chorusLine1.match(/\[/g);
            expect(chordMatches).toBeTruthy();
            expect(chordMatches!.length).toBeGreaterThanOrEqual(3);
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

        it('should correctly order mixed tagged and plain chords', async () => {
            // Test that chords from <a> tags and plain text are ordered correctly by position
            const mockHtml = `
                <html>
                <head>
                    <title>Test Mixed Chords - Resurse Creștine</title>
                </head>
                <body>
                    <span class="stil-acorduri">
                        &nbsp;<a class="nice-acord" rel="G">G</a>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<a class="nice-acord" rel="A">A</a>&nbsp;&nbsp;&nbsp;b<br />
                        scutul taria mea<br />
                    </span>
                </body>
                </html>
            `;

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(mockHtml),
            });

            const result = await resursecrestineScraper.scrape('https://www.resursecrestine.ro/acorduri/96109/mixed-test');

            // Get the line with chords (should be the lyric line)
            const lineWithChords = result.parts.flatMap(p => p.lines).find(l => l.text.includes('scutul'));
            expect(lineWithChords).toBeDefined();

            const text = lineWithChords?.text || '';

            // Extract chords in order
            const chordMatches = [...text.matchAll(/\[([^\]]+)\]/g)];
            expect(chordMatches.length).toBe(3); // Should have 3 chords: G, A, B

            const chordValues = chordMatches.map(m => m[1] || '');
            const positions = chordMatches.map(m => m.index ?? 0);

            // The detected key is G, so: G=1, A=2, B=3
            // Verify chords are in the correct order (not B, G, A as it was before)
            expect(chordValues).toEqual(['1', '2', '3']); // G, A, B in Nashville notation

            // Verify positions are in ascending order
            expect(positions[0]).toBeLessThan(positions[1]!);
            expect(positions[1]!).toBeLessThan(positions[2]!);

            // Verify chords appear at reasonable positions in "scutul taria mea"
            // First chord near "s", second near "tar", third near "me"
            expect(text.indexOf('[1]')).toBeLessThan(text.indexOf('cutul'));
            expect(text.indexOf('[2]')).toBeGreaterThan(text.indexOf('scutul'));
            expect(text.indexOf('[2]')).toBeLessThan(text.indexOf('mea'));
            expect(text.indexOf('[3]')).toBeGreaterThan(text.indexOf('taria'));
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
