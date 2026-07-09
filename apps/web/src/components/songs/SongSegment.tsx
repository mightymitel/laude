import { ReactNode } from 'react';
import styles from './SongLine.module.css';
import { SegmentData, SegmentChord } from '@/hooks/useSongLineSegments';

interface SongSegmentProps {
    segment: SegmentData;
    renderChord?: (chord: SegmentChord) => ReactNode;
    renderText?: (text: string) => ReactNode;
    className?: string;
    // Optional extra props
    [key: string]: unknown;
}

export function SongSegment({
    segment,
    renderChord,
    renderText,
    className = '',
    ...props
}: SongSegmentProps) {
    return (
        <div className={`${styles.segment} ${className}`} {...props}>
            <div className={styles.segmentChords}>
                {segment.chords.map((c, i) => (
                    renderChord ? (
                        <span key={i}>{renderChord(c)}</span>
                    ) : (
                        <span key={i} className={styles.chordBadge}>{c.display}</span>
                    )
                ))}
            </div>
            <div className={styles.segmentText}>
                {renderText ? renderText(segment.text) : segment.text}
            </div>
        </div>
    );
}
