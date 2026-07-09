#!/usr/bin/env node
/**
 * Dependency boundary rule (WP-98 / DEC-55, DEC-64):
 *   packages/*, apps/web and apps/api may NEVER import from apps/laudj or
 *   apps/studio — Laudasist is complete alone; Studio and LauDJ are power-ups.
 * Checks both package.json dependency declarations and source imports.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const GUARDED_ROOTS = ['packages', 'apps/web', 'apps/api'];
const FORBIDDEN_PACKAGES = ['@laude/studio', '@laude/laudj'];
const FORBIDDEN_PATH = /(^|[/'"])apps\/(laudj|studio)\//;
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'data']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const violations = [];

for (const rootRel of GUARDED_ROOTS) {
  const root = join(ROOT, rootRel);
  let entries;
  try {
    entries = statSync(root).isDirectory() ? [root] : [];
  } catch {
    continue;
  }
  for (const base of entries) {
    for (const file of walk(base)) {
      const rel = relative(ROOT, file);
      if (file.endsWith('package.json')) {
        const pkg = JSON.parse(readFileSync(file, 'utf8'));
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
          for (const dep of Object.keys(pkg[section] ?? {})) {
            if (FORBIDDEN_PACKAGES.includes(dep)) {
              violations.push(`${rel}: declares dependency on ${dep}`);
            }
          }
        }
        continue;
      }
      if (!SOURCE_EXT.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (!/\b(import|require|from)\b/.test(line)) continue;
        if (FORBIDDEN_PACKAGES.some((p) => line.includes(`'${p}`) || line.includes(`"${p}`))) {
          violations.push(`${rel}:${i + 1}: imports a forbidden package — ${line.trim()}`);
        } else if (FORBIDDEN_PATH.test(line)) {
          violations.push(`${rel}:${i + 1}: reaches into apps/laudj|studio — ${line.trim()}`);
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Boundary violations (packages/* and apps/web|api must not depend on apps/laudj or apps/studio):');
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('boundaries OK: packages/* and apps/web|api are clean of apps/laudj|studio imports');
