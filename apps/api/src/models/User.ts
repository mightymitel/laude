import { getFirestore } from '../config/firebase.js';
import type { User as UserType } from '@laudasist/shared';

export interface UserDocument extends Omit<UserType, 'id'> {
    firebaseUid: string;
}

export const USERS_COLLECTION = 'users';

export function getUsersCollection() {
    return getFirestore().collection(USERS_COLLECTION);
}