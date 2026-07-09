/**
 * Live Firestore hooks for the platform wireframe. Everything is realtime
 * (onSnapshot) so views follow the concurrent seeder; errors surface in state
 * instead of crashing the view.
 */
import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { COLLECTIONS, type CollectionName, type SessionCurrent, type Song, type SongLyrics } from '@laude/song-model';
import { db } from '@/lib/firebase';
import { lyricsFromDoc, songFromDoc, sessionCurrentFromDoc } from './fire';

export interface CollectionState<T> {
  docs: T[];
  loading: boolean;
  error: string | null;
}

export type DocMapper<T> = (id: string, data: DocumentData) => T;

/** Subscribe to a whole contract collection. `convert` must be a stable (module-level) function. */
export function usePlatformCollection<T>(
  name: CollectionName,
  convert: DocMapper<T>,
): CollectionState<T> {
  const [state, setState] = useState<CollectionState<T>>({ docs: [], loading: true, error: null });
  useEffect(() => {
    return onSnapshot(
      collection(db, name),
      (snap) => {
        setState({ docs: snap.docs.map((d) => convert(d.id, d.data())), loading: false, error: null });
      },
      (err) => {
        console.error(`[platform] ${name} subscription failed`, err);
        setState({ docs: [], loading: false, error: err.message });
      },
    );
  }, [name, convert]);
  return state;
}

/** Laudasist's `songs` rules deny unconstrained queries — read public songs only. */
export function usePublicSongs(): CollectionState<Song> {
  const [state, setState] = useState<CollectionState<Song>>({ docs: [], loading: true, error: null });
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.songs), where('visibility', '==', 'public'));
    return onSnapshot(
      q,
      (snap) => {
        setState({ docs: snap.docs.map((d) => songFromDoc(d.id, d.data())), loading: false, error: null });
      },
      (err) => {
        console.error('[platform] public songs subscription failed', err);
        setState({ docs: [], loading: false, error: err.message });
      },
    );
  }, []);
  return state;
}

/** Same rules constraint as songs: lyrics are queried by public visibility. */
export function usePublicLyrics(): CollectionState<SongLyrics> {
  const [state, setState] = useState<CollectionState<SongLyrics>>({ docs: [], loading: true, error: null });
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.song_lyrics), where('visibility', '==', 'public'));
    return onSnapshot(
      q,
      (snap) => {
        setState({ docs: snap.docs.map((d) => lyricsFromDoc(d.id, d.data())), loading: false, error: null });
      },
      (err) => {
        console.error('[platform] public lyrics subscription failed', err);
        setState({ docs: [], loading: false, error: err.message });
      },
    );
  }, []);
  return state;
}

export interface DocState<T> {
  value: T | null;
  loading: boolean;
  error: string | null;
}

/** Subscribe to one song document; pass null to idle (no song selected). */
export function useSongDoc(songId: string | null): DocState<Song> {
  const [state, setState] = useState<DocState<Song>>({ value: null, loading: songId !== null, error: null });
  useEffect(() => {
    if (songId === null) {
      setState({ value: null, loading: false, error: null });
      return;
    }
    setState({ value: null, loading: true, error: null });
    return onSnapshot(
      doc(db, COLLECTIONS.songs, songId),
      (snap) => {
        const data = snap.data();
        setState({
          value: data === undefined ? null : songFromDoc(snap.id, data),
          loading: false,
          error: null,
        });
      },
      (err) => {
        console.error(`[platform] song doc ${songId} subscription failed`, err);
        setState({ value: null, loading: false, error: err.message });
      },
    );
  }, [songId]);
  return state;
}

export interface SessionCurrentState {
  /** null while the session doc does not exist yet. */
  current: SessionCurrent | null;
  loading: boolean;
  error: string | null;
}

/** Read-only subscription to a live session's `current` pointer (stage view). */
export function useSessionCurrent(sessionId: string): SessionCurrentState {
  const [state, setState] = useState<SessionCurrentState>({ current: null, loading: true, error: null });
  useEffect(() => {
    return onSnapshot(
      doc(db, COLLECTIONS.sessions, sessionId),
      (snap) => {
        const data = snap.data();
        setState({
          current: data === undefined ? null : sessionCurrentFromDoc(data),
          loading: false,
          error: null,
        });
      },
      (err) => {
        console.error(`[platform] session ${sessionId} subscription failed`, err);
        setState({ current: null, loading: false, error: err.message });
      },
    );
  }, [sessionId]);
  return state;
}
