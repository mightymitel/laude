'use client';

import { use } from 'react';
import { useSong } from '@/hooks/useSongs';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SongViewer } from '@/components/songs/SongViewer';

export default function SongDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { data: song, isLoading, error } = useSong(id);

    if (isLoading) return <div className="p-8">Loading song...</div>;
    if (error) return <div className="p-8 text-red-500">Error: {(error as Error).message}</div>;
    if (!song) return notFound();

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link href="/library" style={{ color: '#666', textDecoration: 'none' }}>
                    ← Back to Library
                </Link>
                <Link
                    href={`/library/${id}/edit`}
                    style={{
                        padding: '0.5rem 1rem',
                        background: '#0070f3',
                        color: 'white',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontSize: '0.9rem'
                    }}
                >
                    ✏️ Edit Song
                </Link>
            </div>

            <SongViewer song={song} />
        </div>
    );
}
