import { Router } from 'express';
import * as serviceController from '../controllers/serviceController.js';

const router = Router();

// List services
router.get('/', serviceController.listServices);

// Create service
router.post('/', serviceController.createService);

// Get service details
router.get('/:id', serviceController.getService);

// Update service
router.put('/:id', serviceController.updateService);

// Delete service
router.delete('/:id', serviceController.deleteService);

export default router;
