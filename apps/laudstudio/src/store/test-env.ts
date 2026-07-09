/**
 * Test bootstrap: point the store at a throwaway data dir BEFORE ./paths is
 * loaded (same import-order trick as ../env.ts). Import this FIRST in tests.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.LAUDSTUDIO_DATA_DIR = mkdtempSync(join(tmpdir(), 'laudstudio-test-'));
