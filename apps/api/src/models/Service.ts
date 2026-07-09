import { getFirestore } from '../config/firebase.js';
import type { Service } from '../shared/index.js';

const COLLECTION_NAME = 'services';

export interface ServiceDocument extends Omit<Service, 'id'> {
    // Firestore document structure
}

export function getServicesCollection() {
    return getFirestore().collection(COLLECTION_NAME);
}

export { ServiceDocument as default };
