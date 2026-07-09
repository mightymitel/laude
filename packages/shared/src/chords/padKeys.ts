import type { Key, PadStyle } from '../types/index.js';

/**
 * Mapping of display keys to their pad file equivalents
 * Handles enharmonic equivalents (C# → Db, Gb → F#, etc.)
 */
const KEY_TO_PAD_INFO: Record<Key, { fileKey: string; fileNumber: string }> = {
    'C': { fileKey: 'C', fileNumber: '04' },
    'C#': { fileKey: 'Db', fileNumber: '05' },
    'Db': { fileKey: 'Db', fileNumber: '05' },
    'D': { fileKey: 'D', fileNumber: '06' },
    'D#': { fileKey: 'Eb', fileNumber: '07' },
    'Eb': { fileKey: 'Eb', fileNumber: '07' },
    'E': { fileKey: 'E', fileNumber: '08' },
    'F': { fileKey: 'F', fileNumber: '09' },
    'F#': { fileKey: 'F#', fileNumber: '10' },
    'Gb': { fileKey: 'F#', fileNumber: '10' },
    'G': { fileKey: 'G', fileNumber: '11' },
    'G#': { fileKey: 'Ab', fileNumber: '12' },
    'Ab': { fileKey: 'Ab', fileNumber: '12' },
    'A': { fileKey: 'A', fileNumber: '01' },
    'A#': { fileKey: 'Bb', fileNumber: '02' },
    'Bb': { fileKey: 'Bb', fileNumber: '02' },
    'B': { fileKey: 'B', fileNumber: '03' },
};

/**
 * Firebase Storage bucket URL
 */
const STORAGE_BUCKET = 'laudasist-1c1d2.firebasestorage.app';

/**
 * Get the pad file URL for a given key and style
 */
export function getPadUrl(key: Key, style: PadStyle = 'foundations'): string {
    const padInfo = KEY_TO_PAD_INFO[key];
    if (!padInfo) {
        throw new Error(`No pad mapping for key: ${key}`);
    }

    const { fileKey, fileNumber } = padInfo;
    const styleName = style === 'foundations' ? 'Foundations' : style;
    const fileName = `Reawaken Worship Pads - ${styleName} - ${fileNumber} ${fileKey}.mp3`;
    const encodedFileName = encodeURIComponent(fileName);

    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedFileName}?alt=media`;
}

/**
 * Get the pad key for a given display key (normalizes enharmonics)
 */
export function getPadKey(key: Key): string {
    const padInfo = KEY_TO_PAD_INFO[key];
    return padInfo?.fileKey || key;
}
