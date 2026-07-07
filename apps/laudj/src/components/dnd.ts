/**
 * Native HTML5 drag-and-drop payloads between the parts palette and the queue.
 * Mouse-first for the PoC (HTML5 DnD has no touch support without a shim);
 * every DnD action has a click/tap equivalent ([+] enqueue, play-now, remove).
 */

export const PART_DRAG_TYPE = 'application/x-laudj-part';
export const QUEUE_DRAG_TYPE = 'application/x-laudj-queue';

export interface PartDragPayload {
  song_id: string;
  song_title: string;
  section_index: number;
  section_label: string;
}

function isPartPayload(v: unknown): v is PartDragPayload {
  if (typeof v !== 'object' || v === null) return false;
  // Safe: object narrowing above; every read below is typeof-checked.
  const r = v as Record<string, unknown>;
  return (
    typeof r.song_id === 'string' &&
    typeof r.song_title === 'string' &&
    typeof r.section_index === 'number' &&
    typeof r.section_label === 'string'
  );
}

export function readPartPayload(dt: DataTransfer): PartDragPayload | null {
  const raw = dt.getData(PART_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPartPayload(parsed) ? parsed : null;
  } catch {
    return null; // foreign/garbled drag data — ignore the drop
  }
}

export function readQueueDragId(dt: DataTransfer): string | null {
  const id = dt.getData(QUEUE_DRAG_TYPE);
  return id.length > 0 ? id : null;
}
