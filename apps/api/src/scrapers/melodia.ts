import * as cheerio from 'cheerio';
import type { Scraper, ScrapedSong } from './index.js';
import type { SongPart, Key, PartType } from '../shared/index.js';
import { letterToNashville, formatChord } from '../shared/index.js';

const MELODIA_DOMAIN = 'melodia.ro';

export const melodiaScraper: Scraper = {
    canHandle(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.hostname.includes(MELODIA_DOMAIN);
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

        // Extract title from h1 (remove key suffix if present)
        const h1Text = $('h1').first().text().trim();
        const title = h1Text.replace(/\s+[CDEFGAB][b#]?\s*$/, '').trim();

        // Extract author/composer from metadata
        let author = '';
        const authorLi = $('ul.author li').text();
        if (authorLi) {
            author = authorLi
                .replace(/Muzica de|Versuri de/g, '')
                .split(/\s{2,}/)
                .filter(s => s.trim())
                .join(', ')
                .trim();
        }

        // Extract key from the selected option in key selector
        const selectedKey = $('select option[selected]').attr('value') || 'D';
        const originalKey = selectedKey as Key;

        // Parse parts from lyrics container
        const lyricsContainer = $('.lyrics-container.column-view');
        const parts: SongPart[] = [];
        const partCounts: Record<PartType, number> = {
            verse: 0, chorus: 0, bridge: 0, 'pre-chorus': 0,
            outro: 0, intro: 0, tag: 0
        };

        // Map class names to part types
        const classToType: Record<string, PartType> = {
            'verse': 'verse',
            'chorus': 'chorus',
            'prechorus': 'pre-chorus',
            'bridge': 'bridge',
            'intro': 'intro',
            'outro': 'outro',
            'tag': 'tag'
        };

        // Get the visible parts (not the hidden ones with "with-chords" class)
        lyricsContainer.children('div').not('.hidden').each((_, el) => {
            const $el = $(el);
            const classes = $el.attr('class')?.split(' ') || [];

            // Skip modulation divs
            if (classes.includes('modulation')) return;

            // Determine part type from class
            let partType: PartType = 'verse';
            for (const cls of classes) {
                if (classToType[cls]) {
                    partType = classToType[cls];
                    break;
                }
            }

            partCounts[partType]++;

            // Parse the content: replace <div class="chord">X</div> with [Nashville] and <br> with newlines
            const htmlContent = $el.html() || '';

            // Convert chord divs to Nashville bracket notation
            let processed = htmlContent
                .replace(/<div class="chord[^"]*">([^<]+)<\/div>/g, (_, letterChord) => {
                    const nashvilleChord = letterToNashville(letterChord, originalKey);
                    if (nashvilleChord) {
                        return `[${formatChord(nashvilleChord, originalKey, 'nashville')}]`;
                    }
                    return `[${letterChord}]`; // Fallback to original
                })
                .replace(/<div class="modulation"[^>]*>.*?<\/div>/g, '') // Remove modulation markers
                .replace(/<br\s*\/?>/g, '\n');

            // Remove any remaining HTML tags
            processed = $('<div>').html(processed).text();

            // Split into lines and create part
            const lines = processed.split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            if (lines.length > 0) {
                parts.push({
                    id: `${partType.charAt(0).toUpperCase()}${partCounts[partType]}`,
                    type: partType,
                    index: partCounts[partType],
                    lines: lines.map(text => ({ text }))
                });
            }
        });

        return {
            title: title || 'Untitled',
            author: author || undefined,
            originalKey,
            parts,
            sourceUrl: url,
        };
    }
};
