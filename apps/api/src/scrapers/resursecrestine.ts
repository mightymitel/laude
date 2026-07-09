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

    // Split by <br> to get lines (handle all variants: <br>, <br/>, <br />, <br \/>)
    const rawLines = html.split(/<br[^>]*>/i);

    const parts: SongPart[] = [];
    let currentPart: SongPart | null = null;
    const partCounts: Record<PartType, number> = {
        verse: 0, chorus: 0, bridge: 0, 'pre-chorus': 0,
        outro: 0, intro: 0, tag: 0
    };

    let pendingChordLine: { chord: string; charIndex: number }[] = [];
    let consecutiveEmptyLines = 0;

    for (let rawLine of rawLines) {
        // Trim HTML source whitespace (from pretty-printing), but preserve &nbsp; entities
        // This prevents HTML indentation from affecting part detection
        rawLine = rawLine.trim();

        const chords: { chord: string; charIndex: number }[] = [];

        // Count &nbsp; and detect chord elements for later chord line detection
        const nbspCount = (rawLine.match(/(&nbsp;)/g) || []).length;
        const hasNiceAccord = /<a[^>]*class="nice-acord"/.test(rawLine);

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
                // Include the chord text in cleanText to maintain proper spacing
                const chordText = tagMatch[2] ?? '';
                cleanText += chordText;
                visualPos += chordText.length;
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

            // Regular character (skip newlines and carriage returns)
            const char = lineHtml[i];
            if (char !== '\n' && char !== '\r') {
                cleanText += char;
                visualPos++;
            }
            i++;
        }

        // Determine if this is a chord line AFTER building cleanText
        // IMPORTANT: On resursecrestine.ro, lines are EITHER chords OR lyrics, never mixed
        // A line is a chord line ONLY if:
        // - It has <a class="nice-acord"> tags (tagged chords), OR
        // - It's very short (< 5 chars after trimming) with spaces (like standalone "b")
        // We do NOT extract chords from regular lyric lines even if they have spaces
        const isLikelyChordLine = hasNiceAccord ||
                                   (nbspCount >= 1 && cleanText.trim().length < 5);

        // If this looks like a chord line, extract plain text chords too
        // Extract from cleanText BEFORE trimming to maintain position consistency
        if (isLikelyChordLine && cleanText.trim().length > 0 && cleanText.trim().length < 50) {
            // Parse plain text for chord patterns: A, Am, B, Bm, C#, F#m, etc.
            // Case-insensitive to catch lowercase chords like "b"
            const plainChordRegex = /\b([A-Ga-g][b#]?(?:m|maj|dim|sus|aug|add|\d)*)\b/gi;
            let plainMatch;

            while ((plainMatch = plainChordRegex.exec(cleanText)) !== null) {
                const chordText = plainMatch[1];
                if (!chordText) continue;

                const position = plainMatch.index;

                // Check if this looks like a real chord (not a word like "Am" in "America")
                // Valid chords are typically standalone or surrounded by spaces
                const before = cleanText[position - 1];
                const after = cleanText[position + chordText.length];
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
        }

        // Calculate trim offset and track indentation for part detection
        const leadingSpaces = cleanText.length - cleanText.trimStart().length;
        const cleanLine = cleanText.trim();

        // Track indentation level (2+ spaces at start typically indicates chorus)
        const indentationLevel = leadingSpaces;

        // Adjust all chord positions to account for trimming
        for (const chord of chords) {
            chord.charIndex -= leadingSpaces;
        }

        // Sort chords by position after adjustment
        chords.sort((a, b) => a.charIndex - b.charIndex);

        // Skip empty lines and header info (Capo line, etc.)
        if (!cleanLine && chords.length === 0) {
            consecutiveEmptyLines++;
            pendingChordLine = [];

            // Part boundary detection based on empty lines:
            // - 2+ consecutive empty lines: always split
            // - 1+ empty line after a verse with 4+ lines: split (verses are typically 4 lines)
            const shouldSplitOnEmptyLine = currentPart && currentPart.lines.length > 0 && (
                consecutiveEmptyLines >= 2 ||
                (consecutiveEmptyLines >= 1 && currentPart.type === 'verse' && currentPart.lines.length >= 4)
            );

            if (shouldSplitOnEmptyLine) {
                currentPart = null; // Reset so next line starts a new part
            }
            continue;
        }

        // Reset empty line counter when we hit content
        consecutiveEmptyLines = 0;

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

        // If this line has chords but no real text (only chord letters and spaces), save as pending
        // Remove all chord letters to check if there's actual lyric text
        let textWithoutChords = cleanLine;
        for (const chord of chords) {
            // Remove the chord letter/text from the line
            textWithoutChords = textWithoutChords.replace(new RegExp(`\\b${chord.chord}\\b`, 'gi'), '');
        }
        textWithoutChords = textWithoutChords.replace(/\s+/g, '').trim();

        if (chords.length > 0 && textWithoutChords.length < 3) {
            pendingChordLine = chords;
            continue;
        }

        // Detect part changes using multiple heuristics (patterns vary on resursecrestine.ro)
        // IMPORTANT: Only use indentation for LYRIC lines (lines with actual text, not chord-only)
        // Chord-only lines often have spacing but shouldn't influence part detection
        const hasLyricText = cleanLine.length > 5; // Actual lyrics are longer than just chord letters
        const isIndented = hasLyricText && indentationLevel >= 2;

        // Only consider indentation changes if current part has substantial content
        const hasSubstantialContent = currentPart && currentPart.lines.length >= 4;
        const indentationChanged = currentPart && hasLyricText && (
            (isIndented && currentPart.type === 'verse') ||
            (!isIndented && currentPart.type === 'chorus')
        );

        // Start new part if indentation changed AND we have substantial content
        // This prevents splitting too early but catches real part boundaries
        if (indentationChanged && hasSubstantialContent) {
            currentPart = null;
        }

        // Create part if needed, using indentation to determine type (only for lyric lines)
        if (!currentPart) {
            // Indented lyric lines (2+ spaces) are typically chorus
            const partType: PartType = isIndented ? 'chorus' : 'verse';
            partCounts[partType]++;
            currentPart = {
                id: `${partType.charAt(0).toUpperCase()}${partCounts[partType]}`,
                type: partType,
                index: partCounts[partType],
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

