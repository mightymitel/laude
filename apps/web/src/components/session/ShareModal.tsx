import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { VIEWPORT_CLASSES, type ViewportClass } from '../../viewports/contract'
import { ShareButton } from '@/components/ShareButton'
import styles from '../../routes/session.module.css'

const VIEWPORT_LABELS: Record<ViewportClass, string> = {
    main: '🎤 Main',
    stage: '🎸 Stage',
    instrument: '🎹 Instrument',
    subtitles: '💬 Subtitles',
}

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
    const [selectedViewport, setSelectedViewport] = useState<ViewportClass>('main')
    const viewerLink = `${shareUrl}?type=${selectedViewport}`

    return (
        <div className={styles.qrOverlay} onClick={onClose}>
            <div className={styles.qrModal} onClick={(e) => e.stopPropagation()}>
                <h2>Share Session</h2>

                <div className={styles.viewportSelector}>
                    {VIEWPORT_CLASSES.map((viewport) => (
                        <button
                            key={viewport}
                            onClick={() => setSelectedViewport(viewport)}
                            className={`${styles.viewportBtn} ${selectedViewport === viewport ? styles.viewportBtnActive : ''}`}
                        >
                            {VIEWPORT_LABELS[viewport]}
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

                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                    <ShareButton
                        testId="share-viewer-link"
                        className={styles.qrCopyBtn}
                        payload={{
                            title: 'Laudasist worship session',
                            text: 'Join our worship session — live now',
                            url: viewerLink,
                        }}
                    >
                        📤 Share Viewer Link
                    </ShareButton>
                    <button
                        onClick={() => {
                            void navigator.clipboard.writeText(viewerLink)
                        }}
                        className={styles.qrCopyBtn}
                    >
                        📋 Copy
                    </button>
                </div>

                <div className={styles.presenterSection}>
                    <span className={styles.presenterLabel}>🎙️ Presenter Link</span>
                    <p className={styles.presenterUrl}>{presenterUrl}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <ShareButton
                            testId="share-presenter-link"
                            className={styles.qrCopyBtn}
                            payload={{
                                title: 'Present in our worship session',
                                text: "You're invited to present in our worship session",
                                url: presenterUrl,
                            }}
                        >
                            📤 Share Presenter Link
                        </ShareButton>
                        <button
                            onClick={() => {
                                void navigator.clipboard.writeText(presenterUrl)
                            }}
                            className={styles.qrCopyBtn}
                        >
                            📋 Copy
                        </button>
                    </div>
                </div>

                <button onClick={onClose} className={styles.qrCloseBtn}>
                    Close
                </button>
            </div>
        </div>
    )
}
