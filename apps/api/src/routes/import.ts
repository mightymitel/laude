import { Router } from 'express';
import { getScraper } from '../scrapers/index.js';
import { dedupeRepeatedParts } from '../scrapers/dedupeParts.js';

const router = Router();

/**
 * POST /api/import/preview
 * Body: { url: string }
 * Returns scraped song data for preview
 */
router.post('/preview', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Find appropriate scraper
        const scraper = getScraper(url);
        if (!scraper) {
            return res.status(400).json({
                error: 'Unsupported website',
                message: 'Currently supported: melodia.ro, resursecrestine.ro'
            });
        }

        // Scrape the page, then fold exact-repeat parts into one canonical
        // part + a starting default arrangement (WP-174/DEC-149 — the
        // import is a DRAFT; the editor's composer has full control).
        const result = await scraper.scrape(url);
        const deduped = dedupeRepeatedParts(result.parts);

        return res.json({
            ...result,
            parts: deduped.parts,
            ...(deduped.defaultArrangement !== undefined
                ? { defaultArrangement: deduped.defaultArrangement }
                : {}),
        });
    } catch (error) {
        console.error('Import error:', error);
        return res.status(500).json({
            error: 'Failed to import song',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
