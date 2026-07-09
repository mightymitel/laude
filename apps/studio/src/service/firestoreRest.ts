/**
 * User-credentialed Firestore access for the bridge (WP-114). Studio acts as
 * A LOGGED-IN USER (DEC-24, Bridge spec): every cloud read/write carries the
 * standing sign-in's ID token and is subject to SECURITY RULES — never a
 * service-account/Admin credential, which in a shipped desktop app would
 * make the rules decorative.
 *
 * Plain Firestore REST (emulator host when present, production otherwise) —
 * no SDK: firebase-admin must not be reachable from the shipped app's write
 * path, and the client JS SDK drags a browser-shaped dependency into a Node
 * service for four verbs.
 */
import { PROJECT_ID } from '../env';
import { currentIdToken } from './auth';

const DOCS_BASE = (): string => {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  const host = emulator ? `http://${emulator}` : 'https://firestore.googleapis.com';
  return `${host}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
};

// --- Firestore REST value encoding ------------------------------------------

type FsValue = Record<string, unknown>;

export function encodeValue(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') {
    const fields: Record<string, FsValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  throw new Error(`cannot encode Firestore value of type ${typeof v}`);
}

export function decodeValue(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(String(v.timestampValue));
  if ('arrayValue' in v) {
    const arr = v.arrayValue as { values?: FsValue[] };
    return (arr.values ?? []).map(decodeValue);
  }
  if ('mapValue' in v) {
    const map = v.mapValue as { fields?: Record<string, FsValue> };
    return decodeFields(map.fields ?? {});
  }
  return null;
}

export function encodeFields(data: Record<string, unknown>): Record<string, FsValue> {
  const fields: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) fields[k] = encodeValue(v);
  }
  return fields;
}

export function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeValue(v);
  return out;
}

// --- The four verbs the bridge needs ----------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await currentIdToken()}`,
    'Content-Type': 'application/json',
  };
}

async function fsError(res: Response, what: string): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
  return new Error(`${what}: ${body?.error?.status ?? res.status} ${body?.error?.message ?? ''}`.trim());
}

/** Read one document; null when it doesn't exist (or rules deny — Firestore
 * reports both as NOT_FOUND/PERMISSION_DENIED; the caller treats either as
 * "not readable as this user"). */
export async function getUserDoc(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${DOCS_BASE()}/${path}`, { headers: await authHeaders() });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw await fsError(res, `read ${path}`);
  const doc = (await res.json()) as { fields?: Record<string, FsValue> };
  return decodeFields(doc.fields ?? {});
}

/** Create a document with a chosen id — FAILS if it already exists
 * (ALREADY_EXISTS), which is exactly mint's no-overwrite guarantee. */
export async function createUserDoc(
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `${DOCS_BASE()}/${collection}?documentId=${encodeURIComponent(id)}`,
    { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ fields: encodeFields(data) }) },
  );
  if (!res.ok) throw await fsError(res, `create ${collection}/${id}`);
}

/** Update named fields of an existing document (rules-checked as the user). */
export async function patchUserDoc(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  const mask = Object.keys(data)
    .map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`)
    .join('&');
  const res = await fetch(`${DOCS_BASE()}/${path}?${mask}&currentDocument.exists=true`, {
    method: 'PATCH',
    headers: await authHeaders(),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok) throw await fsError(res, `update ${path}`);
}

/** Equality query on one collection field. */
export async function queryUserDocs(
  collection: string,
  field: string,
  value: string,
  limit = 5,
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const res = await fetch(`${DOCS_BASE()}:runQuery`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: 'EQUAL',
            value: encodeValue(value),
          },
        },
        limit,
      },
    }),
  });
  if (!res.ok) throw await fsError(res, `query ${collection}.${field}`);
  const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, FsValue> } }[];
  return rows
    .filter((r): r is { document: { name: string; fields?: Record<string, FsValue> } } => r.document !== undefined)
    .map((r) => ({
      id: r.document.name.slice(r.document.name.lastIndexOf('/') + 1),
      data: decodeFields(r.document.fields ?? {}),
    }));
}
