import type { SongPart, Key } from '../shared/index.js';

export interface ScrapedSong {
    title: string;
    author?: string;
    defaultKey: Key;
    parts: SongPart[];
    sourceUrl: string;
}

export interface Scraper {
    canHandle(url: string): boolean;
    scrape(url: string): Promise<ScrapedSong>;
}

import { melodiaScraper } from './melodia.js';
import { resursecrestineScraper } from './resursecrestine.js';

const scrapers: Scraper[] = [
    melodiaScraper,
    resursecrestineScraper,
];

export function getScraper(url: string): Scraper | null {
    return scrapers.find(s => s.canHandle(url)) || null;
}

export { melodiaScraper, resursecrestineScraper };
