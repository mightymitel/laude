/**
 * Silent demo sign-in for the wireframe: the Laudasist `songs` rules require
 * an authenticated owner for writes (curation promote). Sign in the demo user,
 * creating it on the fly when the emulator was freshly wiped.
 */
import { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const DEMO_EMAIL = 'demo@laude.local';
const DEMO_PASSWORD = 'parola-demo';

let attempted = false;

export function ensureDemoSignIn(): void {
  if (attempted || auth.currentUser !== null) return;
  attempted = true;
  signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD)
    .catch(() => createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD))
    // Creation can lose a race against a concurrent seeder creating the same
    // user — one final sign-in retry covers that before giving up.
    .catch(() => signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD))
    .catch((err: unknown) => {
      attempted = false;
      console.error('[platform] demo sign-in failed', err);
    });
}

export function useAuthUser(): User | null {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
