import * as cheerio from 'cheerio';
import type { Scraper, ScrapedSong } from './index.js';
import type { SongPart, Key, PartType } from '../shared/index.js';
import { letterToNashville, formatChord, detectKeyFromChords } from '../shared/index.js';

const RC_DOMAIN = 'resursecrestine.ro';

export const resursecrestineScraper: Scraper = {
    canHandle(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.hostname.includes(RC_DOMAIN) && url.includes('/acorduri/');
        } catch {
            return false;
        }
    },

    async scrape(url: string): Promise<ScrapedSong> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.status}`);
        }
        const html = await response.text();
        const $ = cheerio.load(html);

        // Extract title from page title (format: "Song Name - Resurse Creștine")
        const pageTitle = $('title').text();
        const titleMatch = pageTitle.match(/^\s*(.+?)\s*-\s*Resurse/);
        const title = titleMatch?.[1]?.trim() ?? 'Untitled';

        // Extract author from page (if available in metadata)
        let author = '';
        const metaDesc = $('meta[name="description"]').attr('content') || '';
        const authorMatch = metaDesc.match(/(?:artist|autor):\s*([^,\n]+)/i);
        if (authorMatch) {
            author = (authorMatch[1] ?? '').trim();
        }

        // Get the span.stil-acorduri content
        const stilAcorduriHtml = $('span.stil-acorduri').html() || '';

        // Extract all chords from the page
        const chordRegex = /class="nice-acord"[^>]*rel="([A-G][b#]?[a-z0-9]*)"/g;
        const allChords: string[] = [];
        let match;
        while ((match = chordRegex.exec(stilAcorduriHtml)) !== null) {
            if (match[1]) allChords.push(match[1]);
        }

        // Detect key from all chords using music theory
        let originalKey: Key = detectKeyFromChords(allChords);

        // Override with capo info if present
        const capoMatch = stilAcorduriHtml.match(/Capo[^(]*\(([A-G][b#]?)/i);
        if (capoMatch) {
            originalKey = capoMatch[1] as Key;
        }

        // Parse the content - chords are in <a class="nice-acord"> tags or standalone
        // and lyrics are mixed with &nbsp; for spacing
        const parts = parseResurseCrestineContent(stilAcorduriHtml, originalKey);

        return {
            title,
            author: author || undefined,
            originalKey,
            parts,
            sourceUrl: url,
        };
    }
};

function parseResurseCrestineContent(html: string, key: Key): SongPart[] {
    // First, extract chord positions before converting
    // Chords are in <a class="nice-acord" rel="CHORD">
    // and spaces are represented by &nbsp;

    // Split by <br> to get lines
    const rawLines = html.split(/<br\s*\/?>/i);

    const parts: SongPart[] = [];
    let currentPart: SongPart | null = null;
    const partCounts: Record<PartType, number> = {
        verse: 0, chorus: 0, bridge: 0, 'pre-chorus': 0,
        outro: 0, intro: 0, tag: 0
    };

    let pendingChordLine: { chord: string; charIndex: number }[] = [];

    for (const rawLine of rawLines) {
        // Check if this line has chords
        const chordRegex = /<a[^>]*class="nice-acord"[^>]*rel="([^"]+)"[^>]*>[^<]*<\/a>/g;
        const chords: { chord: string; charIndex: number }[] = [];

        // Count character positions (each &nbsp; or chord = 1 visual char)
        let visualPos = 0;
        let lastIdx = 0;
        let match;

        // Clone regex for matching
        const lineHtml = rawLine;

        // Process the line to extract chord positions
        while ((match = chordRegex.exec(lineHtml)) !== null) {
            // Count visual characters before this chord
            const beforeChord = lineHtml.substring(lastIdx, match.index);
            // Convert &nbsp; to space and strip HTML tags to get pure text length
            const textBeforeChord = beforeChord.replace(/&nbsp;/g, ' ').replace(/<[^>]+>/g, '');
            visualPos += textBeforeChord.length;

            chords.push({
                chord: match[1] ?? '',
                charIndex: visualPos
            });

            lastIdx = match.index + match[0].length;
        }

        // Clean the line: remove HTML, convert &nbsp; to space
        const cleanLine = rawLine
            .replace(/<a[^>]*class="nice-acord"[^>]*>[^<]*<\/a>/g, '') // Remove chord tags
            .replace(/&nbsp;/g, ' ')
            .replace(/<[^>]+>/g, '') // Remove other HTML tags
            .trim();

        // Skip empty lines and header info (Capo line, etc.)
        if (!cleanLine && chords.length === 0) {
            pendingChordLine = [];
            continue;
        }

        if (cleanLine.match(/^Capo\s*#?\d+/i)) {
            pendingChordLine = [];
            continue;
        }

        // Check for part markers: R:, V:, B:, etc.
        const partMarkerMatch = cleanLine.match(/^([RVB]):\s*(.*)/i);
        if (partMarkerMatch) {
            const markerType = (partMarkerMatch[1] ?? '').toUpperCase();
            const restOfLine = partMarkerMatch[2];

            let partType: PartType = 'verse';
            if (markerType === 'R') partType = 'chorus';
            else if (markerType === 'B') partType = 'bridge';
            else partType = 'verse';

            partCounts[partType]++;
            currentPart = {
                id: `${partType.charAt(0).toUpperCase()}${partCounts[partType]}`,
                type: partType,
                index: partCounts[partType],
                lines: []
            };
            parts.push(currentPart);

            // If there's text after the marker, add it as a line
            if (restOfLine?.trim()) {
                currentPart.lines.push({ text: restOfLine.trim() });
            }
            pendingChordLine = [];
            continue;
        }

        // If this line has chords but no real text, save as pending
        if (chords.length > 0 && cleanLine.length < 3) {
            pendingChordLine = chords;
            continue;
        }

        // Create part if needed
        if (!currentPart) {
            partCounts.verse++;
            currentPart = {
                id: `V${partCounts.verse}`,
                type: 'verse',
                index: partCounts.verse,
                lines: []
            };
            parts.push(currentPart);
        }

        // Merge pending chords with this line
        let finalLine = cleanLine;
        const chordsToInsert = pendingChordLine.length > 0 ? pendingChordLine : chords;

        if (chordsToInsert.length > 0) {
            // Sort by position descending to insert from end to beginning
            const sorted = [...chordsToInsert].sort((a, b) => b.charIndex - a.charIndex);

            for (const c of sorted) {
                const pos = Math.min(c.charIndex, finalLine.length);
                // Convert letter chord to Nashville notation
                const nashvilleChord = letterToNashville(c.chord, key);
                if (nashvilleChord) {
                    const nashvilleStr = formatChord(nashvilleChord, key, 'nashville');
                    finalLine = finalLine.slice(0, pos) + `[${nashvilleStr}]` + finalLine.slice(pos);
                } else {
                    // Fallback to original if conversion fails
                    finalLine = finalLine.slice(0, pos) + `[${c.chord}]` + finalLine.slice(pos);
                }
            }
        }

        pendingChordLine = [];

        // Add line if not empty
        if (finalLine.trim()) {
            currentPart.lines.push({ text: finalLine.trim() });
        }
    }

    return parts;
}

