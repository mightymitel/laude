/**
 * @laude/auth — wraps Firebase Auth for the platform apps.
 * PoC scope: connect to the Auth emulator and offer a one-click demo sign-in
 * (email/password against the emulator; the seeder creates the account).
 */
import type { FirebaseApp } from 'firebase/app';
import {
  Auth,
  User,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

export const DEMO_EMAIL = 'demo@laude.local';
export const DEMO_PASSWORD = 'parola-demo';

export interface LaudeAuth {
  auth: Auth;
  signInDemo(): Promise<User>;
  signOutUser(): Promise<void>;
  onUser(callback: (user: User | null) => void): () => void;
}

export function initAuth(app: FirebaseApp, options: { emulatorUrl?: string } = {}): LaudeAuth {
  const auth = getAuth(app);
  if (options.emulatorUrl) {
    connectAuthEmulator(auth, options.emulatorUrl, { disableWarnings: true });
  }

  return {
    auth,
    async signInDemo() {
      try {
        const credentials = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
        return credentials.user;
      } catch {
        // Emulator wiped or seeder not run yet — create the demo account on the fly.
        const credentials = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
        return credentials.user;
      }
    },
    signOutUser: () => signOut(auth),
    onUser: (callback) => onAuthStateChanged(auth, callback),
  };
}
