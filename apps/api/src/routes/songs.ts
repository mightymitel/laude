import { Router, type NextFunction, type Request, type Response } from 'express';
import * as songController from '../controllers/songController.js';
import { invalidateLyricsIndex } from '../search/lyricsIndex.js';

const router = Router();

// Library writes invalidate the lyrics search index (WP-105). Firing before
// the handler is deliberate: a spurious invalidation only costs a rebuild.
function invalidateSearch(_req: Request, _res: Response, next: NextFunction): void {
    invalidateLyricsIndex();
    next();
}

// List songs
router.get('/', songController.listSongs);

// Create song
router.post("/", invalidateSearch, songController.createSong);

// Get song details
router.get('/:id', songController.getSong);

// Update song
router.put("/:id", invalidateSearch, songController.updateSong);

// Delete song
router.delete("/:id", invalidateSearch, songController.deleteSong);

// We need to move the other handlers too if we want to be clean, but this is the bulk.

export default router;
