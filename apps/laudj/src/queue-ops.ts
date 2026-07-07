/** Pure part-queue math (extracted for unit-sanity testing without Web Audio). */
import type { ActiveQueueEntry, QueueEntry } from '@laude/laudj-control-protocol';

export function insertEntry(queue: QueueEntry[], entry: QueueEntry, at?: number): QueueEntry[] {
  const next = [...queue];
  const index = at === undefined ? next.length : Math.max(0, Math.min(next.length, at));
  next.splice(index, 0, entry);
  return next;
}

export function removeEntry(queue: QueueEntry[], id: string): QueueEntry[] {
  return queue.filter((e) => e.id !== id);
}

export function moveEntry(queue: QueueEntry[], id: string, to: number): QueueEntry[] {
  const from = queue.findIndex((e) => e.id === id);
  if (from < 0) return queue;
  const next = [...queue];
  const [entry] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, entry);
  return next;
}

export function updateEntry(
  queue: QueueEntry[],
  id: string,
  patch: Partial<Pick<QueueEntry, 'repeats' | 'mods'>>,
): QueueEntry[] {
  return queue.map((e) => (e.id === id ? { ...e, ...patch } : e));
}

/** A section's playable span: [start, next section start | song end). Null when the index is invalid. */
export function sectionSpan(
  sections: { start_s: number }[],
  index: number,
  durationS: number,
): { start: number; end: number } | null {
  const section = sections[index];
  if (!section) return null;
  const end = sections[index + 1]?.start_s ?? durationS;
  return end > section.start_s ? { start: section.start_s, end } : null;
}

/** Crescendo level 0.55 → 1.0 across the entry's total duration (repeats included). */
export function crescendoLevel(
  entry: ActiveQueueEntry,
  span: { start: number; end: number },
  positionS: number,
): number {
  const len = span.end - span.start;
  const total = len * Math.max(1, entry.repeats);
  const done = (entry.repeats - entry.repeats_left) * len;
  const inSection = Math.max(0, Math.min(len, positionS - span.start));
  const progress = Math.max(0, Math.min(1, (done + inSection) / total));
  return 0.55 + 0.45 * progress;
}
