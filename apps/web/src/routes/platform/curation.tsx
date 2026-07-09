/**
 * LaudStudio curation gate: performances grouped by song; "Promote" writes
 * preferred_performance_id onto the song doc (demo sign-in required by rules).
 */
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, type Performance, type Song } from '@laude/song-model';
import { Button, Card, Chip, EmptyState } from '@laude/design-system';
import { useT } from '@laude/i18n/react';
import { db } from '@/lib/firebase';
import { useAuthUser } from '@/platform/demoAuth';
import { usePlatformCollection, usePublicSongs } from '@/platform/hooks';
import { performanceFromDoc, serviceFromDoc } from '@/platform/fire';
import { PerformanceCard } from '@/platform/components/PerformanceCard';

export const Route = createFileRoute('/platform/curation')({
  component: CurationPage,
});

function CurationPage() {
  const t = useT();
  const user = useAuthUser();
  const songs = usePublicSongs();
  const performances = usePlatformCollection(COLLECTIONS.performances, performanceFromDoc);
  const services = usePlatformCollection(COLLECTIONS.services, serviceFromDoc);
  const [writeError, setWriteError] = useState<string | null>(null);

  const promote = (song: Song, perf: Performance) => {
    updateDoc(doc(db, COLLECTIONS.songs, song.id), { preferred_performance_id: perf.id }).catch(
      (err: unknown) => setWriteError(String(err)),
    );
  };

  const groups = songs.docs
    .map((song) => ({
      song,
      perfs: performances.docs.filter((p) => p.song_id === song.id),
    }))
    .filter((g) => g.perfs.length > 0);

  return (
    <main className="ld-page ld-vstack">
      <h1>{t('curation.title')}</h1>
      {writeError !== null && (
        <Chip state="warn">
          {t('curation.writeError')}: {writeError}
        </Chip>
      )}
      {songs.error !== null || performances.error !== null ? (
        <EmptyState>{t('platform.error')}</EmptyState>
      ) : songs.loading || performances.loading ? (
        <EmptyState>{t('common.loading')}</EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState>{t('curation.noPerformances')}</EmptyState>
      ) : (
        groups.map(({ song, perfs }) => (
          <Card key={song.id}>
            <div className="ld-vstack">
              <div className="ld-hstack">
                <strong>{song.canonical_title}</strong>
                <Chip>
                  {t('common.key')}: {song.original_key}
                </Chip>
                {!song.verified && <Chip state="warn">{t('common.unverified')}</Chip>}
              </div>
              {perfs.map((perf) => {
                const promoted = song.preferred_performance_id === perf.id;
                return (
                  <PerformanceCard
                    key={perf.id}
                    perf={perf}
                    service={services.docs.find((sv) => sv.id === perf.service_id)}
                    promoted={promoted}
                    action={
                      promoted ? (
                        <Chip state="current">{t('curation.promoted')}</Chip>
                      ) : (
                        <Button
                          variant="primary"
                          disabled={user === null}
                          onClick={() => promote(song, perf)}
                        >
                          {t('curation.promote')}
                        </Button>
                      )
                    }
                  />
                );
              })}
            </div>
          </Card>
        ))
      )}
    </main>
  );
}
