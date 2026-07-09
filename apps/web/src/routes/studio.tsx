/**
 * LaudStudio editor page (WP-104): "interpretation always, chart until link".
 * The chart pane is THE SAME SongEditor Laudasist uses, fed through the
 * degree-chart adapter; it goes read-only on link (DEC-68) with two escape
 * hatches — owner override (edits push) and unlink. The mapping panel
 * surfaces only low-confidence rows (proposals); accepted rows are not
 * re-asked (DEC-63).
 *
 * New-feature copy is English-only per DEC-18 (translation pass later).
 */
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import type { Song } from '@laudasist/shared';
import { SongEditor } from '@/components/SongEditor/SongEditor';
import { POSSIBLE_KEYS } from '@/lib/keys';
import { chartToSong, songToChart, type StudioSongDetail } from '@/lib/studioChart';

const SERVICE_URL: string =
  typeof import.meta.env?.VITE_STUDIO_URL === 'string'
    ? import.meta.env.VITE_STUDIO_URL
    : 'http://127.0.0.1:3002';

export const Route = createFileRoute('/studio')({ component: StudioPage });

interface CatalogEntry {
  local_song_id: string;
  title: string;
  linked: boolean;
  performance_id: string | null;
}

interface MapRow {
  section_id: string;
  part_label: string | null;
  part_ordinal: number | null;
  is_instrumental: boolean;
  accepted: boolean;
  confidence: number;
  source: 'auto' | 'human';
}

interface MapSection {
  id: string;
  label: string;
}

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVICE_URL}${path}`, init);
  const body: unknown = await res.json();
  if (!res.ok) {
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    throw new Error(typeof record.error === 'string' ? record.error : `HTTP ${res.status}`);
  }
  return body as T;
}

function StudioPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudioSongDetail | null>(null);
  const [access, setAccess] = useState<'editable' | 'locked' | 'owner'>('editable');
  const [mapRows, setMapRows] = useState<MapRow[]>([]);
  const [mapSections, setMapSections] = useState<MapSection[]>([]);
  const [performanceId, setPerformanceId] = useState<string | null>(null);
  const [rekeyTo, setRekeyTo] = useState('G');
  const [notice, setNotice] = useState<string | null>(null);
  const [serviceDown, setServiceDown] = useState(false);

  useEffect(() => {
    jsonFetch<{ songs: CatalogEntry[] }>('/catalog')
      .then((body) => setCatalog(body.songs))
      .catch(() => setServiceDown(true));
  }, []);

  const load = useCallback(async (id: string) => {
    setSelected(id);
    setNotice(null);
    try {
      const [songDetail, accessBody] = await Promise.all([
        jsonFetch<StudioSongDetail>(`/songs/${id}`),
        jsonFetch<{ access: 'editable' | 'locked' | 'owner' }>(`/songs/${id}/access`),
      ]);
      setDetail(songDetail);
      setAccess(accessBody.access);
      setRekeyTo(songDetail.analysis_key);
      const entry = catalog.find((c) => c.local_song_id === id);
      setPerformanceId(entry?.performance_id ?? null);
      if (entry?.performance_id) {
        const map = await jsonFetch<{ rows: MapRow[]; sections: MapSection[] }>(
          `/performances/${entry.performance_id}/map`,
        );
        setMapRows(map.rows);
        setMapSections(map.sections);
      } else {
        setMapRows([]);
        setMapSections([]);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [catalog]);

  const saveChart = useCallback(async (song: Song) => {
    if (!detail) return;
    try {
      const chordpro = songToChart(song, detail.analysis_key, detail.title);
      const result = await jsonFetch<{ ok: boolean; pushed?: boolean }>(
        `/songs/${detail.local_song_id}/chart`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chordpro }),
        },
      );
      setNotice(result.pushed === true ? 'Saved — pushed to Laudasist (owner override).' : 'Saved locally.');
      void load(detail.local_song_id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [detail, load]);

  const rekey = useCallback(async () => {
    if (!detail) return;
    try {
      await jsonFetch(`/songs/${detail.local_song_id}/rekey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: rekeyTo }),
      });
      setNotice(`Re-keyed to ${rekeyTo} — degrees rotated, audio pitches unchanged.`);
      void load(detail.local_song_id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [detail, rekeyTo, load]);

  const unlink = useCallback(async () => {
    if (!detail) return;
    try {
      await jsonFetch(`/unlink/${detail.local_song_id}`, { method: 'POST' });
      setNotice('Unlinked — the chart is editable again.');
      void load(detail.local_song_id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [detail, load]);

  const review = useCallback(async (sectionId: string, body: Record<string, unknown>) => {
    if (!performanceId) return;
    try {
      const result = await jsonFetch<{ rows: MapRow[] }>(`/performances/${performanceId}/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: sectionId, ...body }),
      });
      setMapRows(result.rows);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }, [performanceId]);

  const proposals = mapRows.filter((r) => !r.accepted && !r.is_instrumental);
  const chartEditable = access !== 'locked';

  return (
    <main className="ld-page ld-vstack">
      <h1>LaudStudio — editor</h1>
      {serviceDown && <p>The LaudStudio service is not running (npm run poc starts it).</p>}
      {notice !== null && <p role="status">{notice}</p>}

      <div className="ld-hstack" style={{ alignItems: 'flex-start', gap: 16 }}>
        <aside className="ld-vstack" style={{ minWidth: 240 }}>
          {catalog.map((entry) => (
            <button
              key={entry.local_song_id}
              onClick={() => void load(entry.local_song_id)}
              style={{ fontWeight: selected === entry.local_song_id ? 700 : 400, textAlign: 'left' }}
            >
              {entry.title} {entry.linked ? '🔗' : ''}
            </button>
          ))}
        </aside>

        {detail && (
          <section className="ld-vstack" style={{ flex: 1 }}>
            <div className="ld-hstack">
              <strong>{detail.title}</strong>
              <span>
                {access === 'locked'
                  ? '🔒 chart locked (linked) — unlink or sign in as the owner'
                  : access === 'owner'
                    ? '✏️ owner override — edits push to Laudasist'
                    : '✏️ local chart — editable'}
              </span>
              {detail.link_state === 'linked' && (
                <button onClick={() => void unlink()}>Unlink</button>
              )}
            </div>

            {chartEditable && (
              <div className="ld-hstack">
                <label>
                  Re-key (analysis key was wrong; rotates degrees):{' '}
                  <select value={rekeyTo} onChange={(e) => setRekeyTo(e.target.value)}>
                    {POSSIBLE_KEYS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void rekey()} disabled={rekeyTo === detail.analysis_key}>
                  Re-key {detail.analysis_key} → {rekeyTo}
                </button>
              </div>
            )}

            {proposals.length > 0 && (
              <div className="ld-vstack">
                <strong>Mapping proposals to review (below threshold — announce instrumental until accepted):</strong>
                {proposals.map((row) => {
                  const section = mapSections.find((s) => s.id === row.section_id);
                  return (
                    <div key={row.section_id} className="ld-hstack">
                      <span>
                        {section?.label ?? row.section_id} → {row.part_label} #{row.part_ordinal}{' '}
                        ({Math.round(row.confidence * 100)}%)
                      </span>
                      <button
                        onClick={() =>
                          void review(row.section_id, {
                            action: 'accept',
                            part_label: row.part_label,
                            part_ordinal: row.part_ordinal,
                          })
                        }
                      >
                        Accept
                      </button>
                      <button onClick={() => void review(row.section_id, { action: 'instrumental' })}>
                        Instrumental
                      </button>
                      <button onClick={() => void review(row.section_id, { action: 'clear' })}>
                        Clear
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {chartEditable ? (
              <SongEditor
                key={`${detail.local_song_id}-${detail.chordpro.length}`}
                song={chartToSong(detail)}
                chordStyle="nashville"
                defaultMode="visual"
                onSave={(song) => void saveChart(song)}
              />
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap' }}>{detail.chordpro}</pre>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
