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
        const chords: { chord: string; charIndex: number }[] = [];

        // Count &nbsp; to detect chord lines
        // Lines with multiple spaces and very little text are likely chord lines
        const nbspCount = (rawLine.match(/(&nbsp;)/g) || []).length;
        const hasNiceAccord = /<a[^>]*class="nice-acord"/.test(rawLine);

        // A line is likely a chord line if:
        // - It has 3+ &nbsp; OR
        // - It has nice-acord tags and some &nbsp; OR
        // - It's very short (< 20 chars after cleaning) and has &nbsp;
        const isLikelyChordLine = nbspCount >= 3 ||
                                   (hasNiceAccord && nbspCount >= 1) ||
                                   (nbspCount >= 1 && rawLine.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').length < 10);

        // Parse line in one pass to extract chords and build clean text simultaneously
        // This ensures tagged and plain chords use the same position system
        let visualPos = 0;
        let cleanText = '';
        let i = 0;
        const lineHtml = rawLine;

        while (i < lineHtml.length) {
            // Check for <a class="nice-acord"> tag
            const tagMatch = lineHtml.slice(i).match(/^<a[^>]*class="nice-acord"[^>]*rel="([^"]+)"[^>]*>([^<]*)<\/a>/);
            if (tagMatch) {
                chords.push({
                    chord: tagMatch[1] ?? '',
                    charIndex: visualPos
                });
                i += tagMatch[0].length;
                continue;
            }

            // Check for &nbsp;
            if (lineHtml.slice(i).startsWith('&nbsp;')) {
                cleanText += ' ';
                visualPos++;
                i += 6; // length of '&nbsp;'
                continue;
            }

            // Check for other HTML tags
            const otherTagMatch = lineHtml.slice(i).match(/^<[^>]+>/);
            if (otherTagMatch) {
                i += otherTagMatch[0].length;
                continue;
            }

            // Regular character
            cleanText += lineHtml[i];
            visualPos++;
            i++;
        }

        // Calculate trim offset to adjust chord positions
        const leadingSpaces = cleanText.length - cleanText.trimStart().length;
        let cleanLine = cleanText.trim();

        // Adjust all chord positions to account for trimming
        for (const chord of chords) {
            chord.charIndex -= leadingSpaces;
        }

        // If this looks like a chord line, extract plain text chords too
        // Use cleanLine (after adjusting positions) for consistency
        const textForChordExtraction = cleanLine;
        if (isLikelyChordLine && textForChordExtraction.length > 0 && textForChordExtraction.length < 50) {
            // Parse plain text for chord patterns: A, Am, B, Bm, C#, F#m, etc.
            // Case-insensitive to catch lowercase chords like "b"
            const plainChordRegex = /\b([A-Ga-g][b#]?(?:m|maj|dim|sus|aug|add|\d)*)\b/gi;
            let plainMatch;

            while ((plainMatch = plainChordRegex.exec(textForChordExtraction)) !== null) {
                const chordText = plainMatch[1];
                if (!chordText) continue;

                const position = plainMatch.index;

                // Check if this looks like a real chord (not a word like "Am" in "America")
                // Valid chords are typically standalone or surrounded by spaces
                const before = textForChordExtraction[position - 1];
                const after = textForChordExtraction[position + chordText.length];
                const isStandalone = (!before || before === ' ') && (!after || after === ' ');

                if (isStandalone) {
                    // Normalize to uppercase (chords like "b" should become "B")
                    const normalizedChord = chordText.charAt(0).toUpperCase() + chordText.slice(1);

                    // Check if we already have this chord from nice-acord tags
                    const alreadyExists = chords.some(c =>
                        Math.abs(c.charIndex - position) < 2 && c.chord.toUpperCase() === normalizedChord.toUpperCase()
                    );

                    if (!alreadyExists) {
                        chords.push({
                            chord: normalizedChord,
                            charIndex: position
                        });
                    }
                }
            }

            // Sort chords by position
            chords.sort((a, b) => a.charIndex - b.charIndex);
        }

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

