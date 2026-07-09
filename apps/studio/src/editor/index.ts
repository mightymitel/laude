/**
 * LaudStudio interpretation editor — STUB entry point (seam only).
 * Scope for this pass = the folder + the edit-operation types; the UI and the
 * apply logic are a separate specced session (see the LaudStudio tickets).
 */
import type { LocalStore } from '../store';
import type { EditOperation, EditResult } from './types';

export type { EditOperation, EditResult } from './types';

export function applyEdit(_store: LocalStore, op: EditOperation): EditResult {
  throw new Error(`LaudStudio editor not built yet (op: ${op.kind}) — see the editor spec/tickets`);
}
