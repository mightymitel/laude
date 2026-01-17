import { Router } from 'express';
import { getScraper } from '../scrapers/index.js';

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

        // Scrape the page
        const result = await scraper.scrape(url);

        return res.json(result);
    } catch (error) {
        console.error('Import error:', error);
        return res.status(500).json({
            error: 'Failed to import song',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
