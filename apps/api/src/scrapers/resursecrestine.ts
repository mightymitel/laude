import * as cheerio from 'cheerio';
import type { Scraper, ScrapedSong } from './index.js';
import type { SongPart, Key, PartType } from '@laudasist/shared';

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

        // Parse the content - chords are in <a class="nice-acord"> tags or standalone
        // and lyrics are mixed with &nbsp; for spacing
        const parts = parseResurseCrestineContent(stilAcorduriHtml);

        // Try to extract key from first line or capo info
        let originalKey: Key = 'G';
        const capoMatch = stilAcorduriHtml.match(/Capo[^(]*\(([A-G][b#]?)/i);
        if (capoMatch) {
            originalKey = capoMatch[1] as Key;
        } else {
            // First chord is often the key
            const firstChordMatch = stilAcorduriHtml.match(/class="nice-acord"[^>]*rel="([A-G][b#]?)"/);
            if (firstChordMatch) {
                originalKey = firstChordMatch[1] as Key;
            }
        }

        return {
            title,
            author: author || undefined,
            originalKey,
            parts,
            sourceUrl: url,
        };
    }
};

function parseResurseCrestineContent(html: string): SongPart[] {
    // Convert HTML entities and normalize
    let text = html
        .replace(/&nbsp;/g, ' ')
        .replace(/<a[^>]*class="nice-acord"[^>]*rel="([^"]+)"[^>]*>[^<]*<\/a>/g, '[$1]')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
        .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines

    const lines = text.split('\n');
    const parts: SongPart[] = [];
    let currentPart: SongPart | null = null;
    const partCounts: Record<PartType, number> = {
        verse: 0, chorus: 0, bridge: 0, 'pre-chorus': 0,
        outro: 0, intro: 0, tag: 0
    };

    // Chord line pattern - line with mostly chords and spaces

    let pendingChords: { chord: string; pos: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const trimmed = line.trim();

        // Skip empty lines and header info (Capo line, etc.)
        if (!trimmed || trimmed.match(/^Capo\s*#?\d+/i)) {
            pendingChords = [];
            continue;
        }

        // Check for part markers: R:, V:, B:, etc.
        const partMarkerMatch = trimmed.match(/^([RVB]):\s*(.*)/i);
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
            pendingChords = [];
            continue;
        }

        // Check if this is a chord-only line (chords on their own line above lyrics)
        const chordMatches = [...line.matchAll(/\[([^\]]+)\]/g)];
        const textWithoutChords = line.replace(/\[[^\]]+\]/g, '').trim();

        if (chordMatches.length > 0 && textWithoutChords.length < 3) {
            // This line is mostly chords - save positions for next lyric line
            pendingChords = chordMatches.map(m => ({
                chord: m[1] ?? '',
                pos: m.index ?? 0
            }));
            continue;
        }

        // This is a lyrics line
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

        // If we have pending chords, merge them with this line
        let finalLine = trimmed;
        if (pendingChords.length > 0 && chordMatches.length === 0) {
            // Insert chords at approximate positions based on character count
            const textLength = finalLine.length;
            let insertions: { pos: number; chord: string }[] = [];

            for (const pc of pendingChords) {
                // Approximate position in lyrics based on relative position
                const approxPos = Math.min(pc.pos, textLength);
                insertions.push({ pos: approxPos, chord: pc.chord });
            }

            // Sort by position descending to insert from end
            insertions.sort((a, b) => b.pos - a.pos);

            for (const ins of insertions) {
                finalLine = finalLine.slice(0, ins.pos) + `[${ins.chord}]` + finalLine.slice(ins.pos);
            }

            pendingChords = [];
        }

        // Keep chords that are already inline
        if (finalLine.trim()) {
            currentPart.lines.push({ text: finalLine.trim() });
        }
    }

    return parts;
}
