import type { Key } from '@laudasist/shared';
import { useWorshipPad } from './useWorshipPad';
import styles from './WorshipPad.module.css';

interface WorshipPadProps {
    displayKey: Key;
}

export function WorshipPad({ displayKey }: WorshipPadProps) {
    const { isPlaying, isLoading, volume, play, stop, setVolume } = useWorshipPad({ displayKey });

    const handleToggle = () => {
        if (isPlaying) {
            stop();
        } else {
            play();
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
    };

    return (
        <div className={styles.container}>
            <button
                onClick={handleToggle}
                disabled={isLoading}
                className={`${styles.toggleBtn} ${isPlaying ? styles.playing : ''}`}
                title={isPlaying ? 'Stop worship pad' : 'Play worship pad'}
            >
                {isLoading ? '⏳' : isPlaying ? '⏸️' : '▶️'} Pad
            </button>

            {isPlaying && (
                <div className={styles.volumeControl}>
                    <span className={styles.volumeIcon}>🔊</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={handleVolumeChange}
                        className={styles.volumeSlider}
                        title={`Volume: ${Math.round(volume * 100)}%`}
                    />
                </div>
            )}
        </div>
    );
}
