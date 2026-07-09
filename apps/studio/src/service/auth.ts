/**
 * Durable Studio sign-in (WP-108; supersedes DEC-24's auth-as-a-moment).
 * Studio holds a persistent signed-in ACCOUNT: the Firebase Auth refresh
 * token is stored in the data dir, silently reused on boot, and exchanged
 * for short-lived ID tokens on demand. Linking/minting uses this standing
 * credential and never prompts; everything else stays offline.
 *
 * This is also the prerequisite for the authenticated presence channel
 * (DJ auto-join, remote extract) — presence itself is a separate opt-in
 * feature and is NOT built here.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR } from '../store/paths';

/** Auth emulator when set; production endpoints otherwise. Read lazily so
 * ../env (or a test) can set the host before the first auth call. */
function authEmulator(): string | undefined {
  return process.env.FIREBASE_AUTH_EMULATOR_HOST;
}
/** The emulator accepts any key; production needs the web API key. */
function apiKey(): string | null {
  return process.env.FIREBASE_WEB_API_KEY ?? (authEmulator() !== undefined ? 'emulator-key' : null);
}

const AUTH_FILE = join(DATA_DIR, 'auth.json');
/** Refresh 5 minutes before expiry. */
const EXPIRY_SLACK_MS = 5 * 60_000;

export interface StoredAuth {
  refresh_token: string;
  uid: string;
  email: string;
}

export interface AuthState {
  signed_in: boolean;
  uid?: string;
  email?: string;
}

interface CachedToken {
  id_token: string;
  expires_at: number;
}

let cached: CachedToken | null = null;

function identityUrl(path: string): string {
  const emulator = authEmulator();
  const base = emulator !== undefined
    ? `http://${emulator}/identitytoolkit.googleapis.com`
    : 'https://identitytoolkit.googleapis.com';
  return `${base}/v1/${path}?key=${apiKey()}`;
}

function secureTokenUrl(): string {
  const emulator = authEmulator();
  const base = emulator !== undefined
    ? `http://${emulator}/securetoken.googleapis.com`
    : 'https://securetoken.googleapis.com';
  return `${base}/v1/token?key=${apiKey()}`;
}

function readStored(): StoredAuth | null {
  if (!existsSync(AUTH_FILE)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(AUTH_FILE, 'utf-8'));
    const auth = raw as Partial<StoredAuth>;
    if (
      typeof auth.refresh_token === 'string' &&
      typeof auth.uid === 'string' &&
      typeof auth.email === 'string'
    ) {
      return { refresh_token: auth.refresh_token, uid: auth.uid, email: auth.email };
    }
  } catch {
    // fall through: a corrupt auth file reads as signed-out
  }
  return null;
}

export function authState(): AuthState {
  const stored = readStored();
  return stored ? { signed_in: true, uid: stored.uid, email: stored.email } : { signed_in: false };
}

export async function signIn(email: string, password: string): Promise<AuthState> {
  if (apiKey() === null) {
    throw new Error('sign-in needs FIREBASE_WEB_API_KEY (or the auth emulator)');
  }
  const res = await fetch(identityUrl('accounts:signInWithPassword'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`sign-in failed: ${body?.error?.message ?? `HTTP ${res.status}`}`);
  }
  const body = (await res.json()) as {
    localId: string;
    email: string;
    refreshToken: string;
    idToken: string;
    expiresIn: string;
  };
  mkdirSync(dirname(AUTH_FILE), { recursive: true });
  const stored: StoredAuth = {
    refresh_token: body.refreshToken,
    uid: body.localId,
    email: body.email,
  };
  writeFileSync(AUTH_FILE, JSON.stringify(stored, null, 2));
  cached = {
    id_token: body.idToken,
    expires_at: Date.now() + Number(body.expiresIn) * 1000 - EXPIRY_SLACK_MS,
  };
  return { signed_in: true, uid: stored.uid, email: stored.email };
}

export function signOut(): void {
  cached = null;
  if (existsSync(AUTH_FILE)) unlinkSync(AUTH_FILE);
}

/**
 * A fresh ID token from the standing credential — the ONLY prompt-free path
 * to an authenticated call (bridge matcher, future presence). Throws when
 * signed out; callers surface that as "sign in first", never as a prompt
 * mid-operation.
 */
export async function currentIdToken(): Promise<string> {
  if (cached && cached.expires_at > Date.now()) return cached.id_token;
  const stored = readStored();
  if (!stored) throw new Error('not signed in — POST /auth/signin first');
  const res = await fetch(secureTokenUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(stored.refresh_token)}`,
  });
  if (!res.ok) {
    throw new Error(`token refresh failed (HTTP ${res.status}) — sign in again`);
  }
  const body = (await res.json()) as { id_token: string; expires_in: string };
  cached = {
    id_token: body.id_token,
    expires_at: Date.now() + Number(body.expires_in) * 1000 - EXPIRY_SLACK_MS,
  };
  return body.id_token;
}

/** The signed-in uid, or throw — the bridge stamps ownership with this. */
export function requireUid(): string {
  const stored = readStored();
  if (!stored) throw new Error('not signed in — POST /auth/signin first');
  return stored.uid;
}
