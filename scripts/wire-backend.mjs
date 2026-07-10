/**
 * One-shot ops: connect the `laudasist` App Hosting backend to the
 * mightymitel/laude repo and set automatic rollouts from `release`
 * (DEC-100/102). Run AFTER granting the Firebase GitHub App access to the
 * repo at https://github.com/settings/installations/104649160 — until then
 * the repo is not linkable and this script reports exactly that.
 *
 *   node scripts/wire-backend.mjs
 *
 * Auth: reuses the local Firebase CLI sign-in (the CLI's own public OAuth
 * client + your stored refresh token). No new credentials are created.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT = 'laudasist-1c1d2';
const LOCATION = 'europe-west4';
const CONNECTION = 'apphosting-github-conn-0ykat';
const LINK_ID = 'mightymitel-laude';
const CLONE_URI = 'https://github.com/mightymitel/laude.git';
const BACKEND = 'laudasist';
const BRANCH = 'release';

const DC = `https://developerconnect.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}`;
const AH = `https://firebaseapphosting.googleapis.com/v1beta/projects/${PROJECT}/locations/${LOCATION}`;

async function accessToken() {
  const cfg = JSON.parse(readFileSync(join(homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      // The Firebase CLI's public OAuth client (public constants).
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: cfg.tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} — run \`firebase login\` first`);
  return (await res.json()).access_token;
}

async function api(token, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function waitLro(token, name) {
  for (let i = 0; i < 60; i++) {
    const { json } = await api(token, 'GET', `https://developerconnect.googleapis.com/v1/${name}`);
    if (json.done) {
      if (json.error) throw new Error(`operation failed: ${JSON.stringify(json.error)}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`operation ${name} did not finish in time`);
}

const token = await accessToken();

// 0. Is the repo linkable yet? (Requires the GitHub-side grant.)
const linkable = await api(token, 'GET', `${DC}/connections/${CONNECTION}:fetchLinkableGitRepositories`);
const uris = (linkable.json.linkableGitRepositories ?? []).map((r) => r.cloneUri);
const links = await api(token, 'GET', `${DC}/connections/${CONNECTION}/gitRepositoryLinks`);
const existing = (links.json.gitRepositoryLinks ?? []).find((l) => l.cloneUri === CLONE_URI);

if (!existing && !uris.includes(CLONE_URI)) {
  console.error(
    `✗ ${CLONE_URI} is not linkable.\n` +
      `  Grant the Firebase App Hosting GitHub App access to mightymitel/laude first:\n` +
      `  https://github.com/settings/installations/104649160 → Repository access.\n` +
      `  Currently linkable: ${uris.join(', ') || '(none)'}`,
  );
  process.exit(1);
}

// 1. Link the repo (idempotent).
if (!existing) {
  const create = await api(
    token,
    'POST',
    `${DC}/connections/${CONNECTION}/gitRepositoryLinks?gitRepositoryLinkId=${LINK_ID}`,
    { cloneUri: CLONE_URI },
  );
  if (create.status >= 400) throw new Error(`link create failed: ${JSON.stringify(create.json)}`);
  await waitLro(token, create.json.name);
  console.log(`✓ linked ${CLONE_URI}`);
} else {
  console.log(`✓ repo already linked`);
}

// 2. Point the backend's codebase at it.
const repoLink = `projects/${PROJECT}/locations/${LOCATION}/connections/${CONNECTION}/gitRepositoryLinks/${LINK_ID}`;
const patch = await api(token, 'PATCH', `${AH}/backends/${BACKEND}?updateMask=codebase`, {
  codebase: { repository: repoLink, rootDirectory: '/' },
});
if (patch.status >= 400) throw new Error(`backend patch failed: ${JSON.stringify(patch.json)}`);
console.log(`✓ backend codebase → ${LINK_ID} (root /)`);

// 3. Automatic rollouts from `release`.
const traffic = await api(token, 'PATCH', `${AH}/backends/${BACKEND}/traffic?updateMask=rolloutPolicy`, {
  rolloutPolicy: { codebaseBranch: BRANCH },
});
if (traffic.status >= 400) throw new Error(`traffic patch failed: ${JSON.stringify(traffic.json)}`);
console.log(`✓ automatic rollouts track '${BRANCH}'`);

console.log(
  `\nDone. Trigger the first rollout by pushing to '${BRANCH}' (or via the console).\n` +
    `Then VERIFY the live runConfig honours apphosting.yaml (maxInstances: 1):\n` +
    `  firebase apphosting:backends:get ${BACKEND} --project ${PROJECT}\n` +
    `Backend URL: https://${BACKEND}--${PROJECT}.${LOCATION}.hosted.app`,
);
