
import {
    createContext,
    useContext,
    useEffect,
    useState,
    ReactNode,
} from 'react';
import {
    User as FirebaseUser,
    onAuthStateChanged,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signOut as firebaseSignOut,
    AuthProvider as FirebaseAuthProvider,
} from 'firebase/auth';
import { auth, googleProvider, facebookProvider, appleProvider } from '@/lib/firebase';
import type { User } from '@laudasist/shared';
import { api } from '@/lib/api';

interface AuthContextType {
    user: User | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    error: string | null;
    signInWithGoogle: () => Promise<void>;
    signInWithFacebook: () => Promise<void>;
    signInWithApple: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch user profile from API
    const fetchUserProfile = async () => {
        try {
            const profile = await api.get<User>('/api/users/me');
            setUser(profile);
        } catch (err) {
            console.error('Failed to fetch user profile:', err);
            setUser(null);
        }
    };

    // Listen to Firebase auth state changes
    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        // Watchdog: with a persisted user, the SDK phones googleapis BEFORE
        // firing the first auth event — on a stalled network that means an
        // app stuck at "Loading…" forever. Render signed-out after 8s; the
        // auth event still updates state whenever it eventually arrives.
        const watchdog = setTimeout(() => {
            console.warn('auth: no state event after 8s — rendering signed-out while it resolves');
            setLoading(false);
        }, 8000);

        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            clearTimeout(watchdog);
            setFirebaseUser(fbUser);

            if (fbUser) {
                await fetchUserProfile();
            } else {
                setUser(null);
            }

            setLoading(false);
        });

        return () => {
            clearTimeout(watchdog);
            unsubscribe();
        };
    }, []);

    // Helper for social login
    const signInWithProvider = async (provider: FirebaseAuthProvider) => {
        setError(null);
        try {
            await signInWithPopup(auth, provider);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
            throw err;
        }
    };

    const signInWithGoogle = () => signInWithProvider(googleProvider);
    const signInWithFacebook = () => signInWithProvider(facebookProvider);
    const signInWithApple = () => signInWithProvider(appleProvider);

    const signInWithEmail = async (email: string, password: string) => {
        setError(null);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
            throw err;
        }
    };

    const signUpWithEmail = async (email: string, password: string) => {
        setError(null);
        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            // Firebase does NOT send this automatically — signup only creates
            // the account. (No-op delivery on the emulator; real mail in prod.)
            await sendEmailVerification(cred.user);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign up failed');
            throw err;
        }
    };

    const signOut = async () => {
        setError(null);
        try {
            await firebaseSignOut(auth);
            setUser(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Sign out failed');
            throw err;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                firebaseUser,
                loading,
                error,
                signInWithGoogle,
                signInWithFacebook,
                signInWithApple,
                signInWithEmail,
                signUpWithEmail,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
