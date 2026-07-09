import { Router } from 'express';
import * as songController from '../controllers/songController.js';

const router = Router();

// List songs
router.get('/', songController.listSongs);

// Create song
router.post('/', songController.createSong);

// Get song details
router.get('/:id', songController.getSong);

// Update song
router.put('/:id', songController.updateSong);

// Delete song
router.delete('/:id', songController.deleteSong);

// We need to move the other handlers too if we want to be clean, but this is the bulk.

export default router;
