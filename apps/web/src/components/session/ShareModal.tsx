import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import styles from '../../routes/session.module.css'

type ViewportType = 'audience' | 'instrument' | 'stage'

/** Go-live share dialog: viewer QR/link per viewport + the presenter link. */
export function ShareModal({
    shareUrl,
    presenterUrl,
    onClose,
}: {
    shareUrl: string
    presenterUrl: string
    onClose: () => void
}) {
    const [selectedViewport, setSelectedViewport] = useState<ViewportType>('audience')
    const viewerLink = `${shareUrl}?type=${selectedViewport}`

    return (
        <div className={styles.qrOverlay} onClick={onClose}>
            <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
                <h2>Share Session</h2>

                <div className={styles.viewportSelector}>
                    {(['audience', 'instrument', 'stage'] as const).map((viewport) => (
                        <button
                            key={viewport}
                            onClick={() => setSelectedViewport(viewport)}
                            className={`${styles.viewportBtn} ${selectedViewport === viewport ? styles.viewportBtnActive : ''}`}
                        >
                            {viewport === 'audience' ? '🎤 Audience' : viewport === 'instrument' ? '🎹 Instrument' : '🎸 Stage'}
                        </button>
                    ))}
                </div>

                <QRCodeSVG
                    value={viewerLink}
                    size={200}
                    level="H"
                    includeMargin
                    bgColor="#ffffff"
                    fgColor="#000000"
                />

                <p className={styles.qrUrl}>{viewerLink}</p>

                <button
                    onClick={() => {
                        navigator.clipboard.writeText(viewerLink)
                    }}
                    className={styles.qrCopyBtn}
                >
                    📋 Copy Viewer Link
                </button>

                <div className={styles.presenterSection}>
                    <span className={styles.presenterLabel}>🎙️ Presenter Link</span>
                    <p className={styles.presenterUrl}>{presenterUrl}</p>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(presenterUrl)
                        }}
                        className={styles.qrCopyBtn}
                    >
                        📋 Copy Presenter Link
                    </button>
                </div>

                <button onClick={onClose} className={styles.qrCloseBtn}>
                    Close
                </button>
            </div>
        </div>
    )
}
