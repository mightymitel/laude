import { Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { getServicesCollection, ServiceDocument } from '../models/Service.js';
import type { ServiceStatus, Key } from '../shared/index.js';

/**
 * List services for the authenticated user
 */
export const listServices = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { status } = req.query;

        let query = getServicesCollection()
            .where('ownerId', '==', req.userId!)
            .orderBy('date', 'desc');

        if (status && typeof status === 'string') {
            query = query.where('status', '==', status);
        }

        const snapshot = await query.limit(50).get();

        const services = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: (doc.data().date as Timestamp)?.toDate?.() || doc.data().date,
            createdAt: (doc.data().createdAt as Timestamp)?.toDate?.() || doc.data().createdAt,
        }));

        res.json({ data: services });
    } catch (error) {
        console.error('Error listing services:', error);
        res.status(500).json({ error: 'Failed to list services' });
    }
};

/**
 * Get a single service by ID
 */
export const getService = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const doc = await getServicesCollection().doc(req.params.id!).get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Service not found' });
            return;
        }

        const service = doc.data() as ServiceDocument;

        // Check ownership
        if (service.ownerId !== req.userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        res.json({
            id: doc.id,
            ...service,
            date: service.date instanceof Date ? service.date : (service.date as Timestamp)?.toDate?.(),
            createdAt: service.createdAt instanceof Date ? service.createdAt : (service.createdAt as Timestamp)?.toDate?.(),
            updatedAt: service.updatedAt instanceof Date ? service.updatedAt : (service.updatedAt as Timestamp)?.toDate?.(),
        });
    } catch (error) {
        console.error('Error fetching service:', error);
        res.status(500).json({ error: 'Failed to fetch service' });
    }
};

/**
 * Create a new service
 */
export const createService = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { title, date } = req.body;

        if (!title) {
            res.status(400).json({ error: 'Title is required' });
            return;
        }

        const newService: ServiceDocument = {
            title,
            date: date ? new Date(date) : new Date(),
            status: 'edit' as ServiceStatus,
            ownerId: req.userId!,
            ownerType: 'user',
            playlist: [],
            biblePlaylist: [],
            viewports: [],
            accessLinks: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const docRef = await getServicesCollection().add(newService);

        res.status(201).json({
            id: docRef.id,
            title: newService.title,
            date: newService.date,
            status: newService.status,
            createdAt: newService.createdAt,
        });
    } catch (error) {
        console.error('Error creating service:', error);
        res.status(500).json({ error: 'Failed to create service' });
    }
};

/**
 * Update a service (playlist, status, current state)
 */
export const updateService = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const docRef = getServicesCollection().doc(req.params.id!);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Service not found' });
            return;
        }

        const service = doc.data() as ServiceDocument;

        if (service.ownerId !== req.userId) {
            res.status(403).json({ error: 'Not authorized to edit this service' });
            return;
        }

        const {
            title,
            date,
            status,
            playlist,
            currentSongId,
            currentPartIndex,
            currentKey,
        } = req.body;

        const updateData: Partial<ServiceDocument> = {
            updatedAt: new Date(),
        };

        if (title) updateData.title = title;
        if (date) updateData.date = new Date(date);
        if (status) updateData.status = status as ServiceStatus;
        if (playlist !== undefined) updateData.playlist = playlist;
        if (currentSongId !== undefined) updateData.currentSongId = currentSongId;
        if (currentPartIndex !== undefined) updateData.currentPartIndex = currentPartIndex;
        if (currentKey !== undefined) updateData.currentKey = currentKey as Key;

        await docRef.update(updateData);

        res.json({ success: true, updatedAt: updateData.updatedAt });
    } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ error: 'Failed to update service' });
    }
};

/**
 * Delete a service
 */
export const deleteService = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const docRef = getServicesCollection().doc(req.params.id!);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({ error: 'Service not found' });
            return;
        }

        const service = doc.data() as ServiceDocument;

        if (service.ownerId !== req.userId) {
            res.status(403).json({ error: 'Not authorized to delete this service' });
            return;
        }

        await docRef.delete();

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Failed to delete service' });
    }
};
