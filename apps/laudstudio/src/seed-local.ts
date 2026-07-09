/**
 * LOCAL mock seeder — fills the LaudStudio SQLite store with the personal-
 * domain side of the demo content (services, segments, performances, sections,
 * beat grids, chord events) so LauDJ has a playable catalog out of the box.
 *
 * No audio files are seeded (stems: [] → LauDJ falls back to simulated
 * playback, same behaviour the Storage placeholders produced before). Every
 * seeded local song is already "linked" (global_song_id = its seeded global
 * id) so the DJ manifest can advertise linked songs.
 *
 * Idempotent: deterministic ids + upserts. Run: npm run seed:local -w apps/laudstudio
 */
import { renderChordSymbol, transposeAmount } from '@laude/chords';
import { buildBeatGrid, buildChordEvents, buildLrc, buildSections, chordProgression, buildChordPro } from './build';
import { SEED_SERVICES } from './content/services';
import { SEED_SONGS, getSeedSong } from './content/songs';
import { LocalStore, type SegmentRow } from './store';
import { mapSectionsToParts } from './store/partmap';

const NOW_ISO = '2026-07-07T09:00:00.000Z'; // fixed so reruns are byte-identical

function main(): void {
  const store = new LocalStore();
  const preferredBySong = new Map<string, string>();
  let performances = 0;
  let sections = 0;

  try {
    for (const song of SEED_SONGS) {
      store.upsertLocalSong({
        id: song.id,
        global_song_id: song.id, // seeded songs exist globally too → linked
        title: song.title,
        language: song.language,
        original_key: song.key,
        default_bpm: song.bpm,
        preferred_performance_id: null, // set after the performance loop
        verified: song.verified,
        created_at: NOW_ISO,
      });
    }

    for (const service of SEED_SERVICES) {
      store.upsertService({
        id: service.id,
        date: service.date,
        title: service.title,
        youtube_id: service.youtube_id,
      });

      const segmentRows: SegmentRow[] = [];
      let songSlot = 0;
      for (const [i, segDef] of service.segments.entries()) {
        const segmentId = `seg-${service.id}-${String(i + 1).padStart(2, '0')}`;
        segmentRows.push({
          id: segmentId,
          service_id: service.id,
          type: segDef.type,
          start_s: segDef.start_s,
          end_s: segDef.end_s,
          local_song_id: segDef.song_id ?? null,
        });

        if (segDef.type !== 'song' || !segDef.song_id || !segDef.performance) continue;
        songSlot += 1;
        const song = getSeedSong(segDef.song_id);
        const perfDef = segDef.performance;
        const perfId = `perf-${service.id.replace(/^svc-/, '')}-s${songSlot}`;
        const key = perfDef.key ?? song.key;
        const bpm = perfDef.bpm ?? song.bpm;
        const durationS = segDef.end_s - segDef.start_s;

        store.upsertPerformance({
          id: perfId,
          local_song_id: song.id,
          service_id: service.id,
          youtube_id: service.youtube_id,
          start_s: segDef.start_s,
          end_s: segDef.end_s,
          key,
          bpm,
          chordpro: buildChordPro(song),
          lrc: song.withLrc ? buildLrc(song) : [],
          verified: perfDef.verified,
          created_at: NOW_ISO,
        });
        performances += 1;

        if (perfDef.tier2) {
          const built = buildSections(perfId, durationS, bpm);
          const partMap = mapSectionsToParts(built.map((s) => s.label), buildChordPro(song));
          const sectionRows = built.map((s, i) => ({
            label: s.label,
            start_s: s.start_s,
            end_s: s.end_s,
            start_bar: s.start_bar,
            end_bar: s.end_bar,
            work_part_index: partMap[i] ?? null,
          }));
          store.replaceSections(perfId, sectionRows);
          sections += sectionRows.length;

          const grid = buildBeatGrid(perfId, durationS, bpm);
          store.setBeatgrid(perfId, bpm, grid.beats, grid.downbeats);

          const semitones = transposeAmount(song.key, key);
          const progression = chordProgression(song).map((symbol) =>
            renderChordSymbol(symbol, semitones, 'english', { key }),
          );
          store.setChords(perfId, buildChordEvents(progression, durationS, bpm), perfDef.verified);
        }

        if (perfDef.promoted && !preferredBySong.has(song.id)) {
          preferredBySong.set(song.id, perfId);
        }
      }
      store.replaceSegments(service.id, segmentRows);
    }

    for (const song of SEED_SONGS) {
      const preferred = preferredBySong.get(song.id);
      const row = store.getLocalSong(song.id);
      if (row && preferred) {
        store.upsertLocalSong({ ...row, preferred_performance_id: preferred });
      }
    }

    console.log(
      `Local seed complete: ${SEED_SONGS.length} songs, ${performances} performances, ${sections} sections (no audio files — simulated playback).`,
    );
  } finally {
    store.close();
  }
}

main();
