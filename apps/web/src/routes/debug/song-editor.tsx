import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { SongEditor } from '@/components/SongEditor';
import { Song } from '@laudasist/shared';

// Mock Song for testing
const MOCK_SONG: Song = {
    id: 'test-1',
    title: 'Test Song: Amazing Grace',
    author: 'John Newton',
    originalKey: 'C',
    defaultArrangement: ['V1', 'C1', 'V2', 'C1'],
    arrangements: [],
    parts: [
        {
            id: 'V1',
            type: 'verse',
            index: 1,
            lines: [
                { text: '  [1]Amazing [4]grace how [5]sweet the sound' },
                { text: '  That [6m]saved a [5/7]wretch like [1]me' }
            ]
        },
        {
            id: 'C1',
            type: 'chorus',
            index: 1,
            lines: [
                { text: '  [5]My chains are [1]gone, I\'ve been [4]set [1]free' },
                { text: '  My [5]God, my [1]Savior has [5]ransomed [1]me' }
            ]
        }
    ],
    tags: ['worship', 'hymn'],
    libraryType: 'user',
    ownerId: 'user-1',
    visibility: 'private',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1'
};

export const Route = createFileRoute('/debug/song-editor')({
    component: SongEditorDebugPage,
});

function SongEditorDebugPage() {
    const [song, setSong] = useState<Song>(MOCK_SONG);
    const [savedSong, setSavedSong] = useState<Song | null>(null);

    return (
        <div style={{ padding: '20px', height: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h1>Song Editor Debug</h1>

            <div style={{ flex: 1, border: '1px solid #444', height: '600px', borderRadius: '8px', overflow: 'hidden' }}>
                <SongEditor
                    song={song}
                    onSave={(s) => {
                        console.log('Saved:', s);
                        setSavedSong(s);
                    }}
                    onCancel={() => console.log('Cancelled')}
                    variant="page"
                />
            </div>

            {savedSong && (
                <div style={{ padding: '10px', background: '#222', borderRadius: '4px' }}>
                    <h3>Last Saved Output:</h3>
                    <pre>{JSON.stringify(savedSong, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
