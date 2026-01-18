import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import styles from './index.module.css'

export const Route = createFileRoute('/')({
    component: Home,
})

function Home() {
    const { user, loading, signInWithGoogle } = useAuth()
    const router = useRouter()

    useEffect(() => {
        if (user && !loading) {
            router.navigate({ to: '/dashboard' })
        }
    }, [user, loading, router])

    if (user && !loading) return null

    return (
        <main className={styles.main}>
            <div className={styles.hero}>
                <h1 className={styles.title}>
                    <span className={styles.brand}>Laudasist</span>
                    <span className={styles.tagline}>Your Worship Assistant</span>
                </h1>

                <p className={styles.description}>
                    Manage your worship services with ease. Create song libraries,
                    build playlists, and lead your congregation with confidence.
                </p>

                <div className={styles.cta}>
                    {loading ? (
                        <div className={styles.loading}>Loading...</div>
                    ) : user ? (
                        <Link to="/dashboard" className={styles.primaryButton}>
                            Go to Dashboard
                        </Link>
                    ) : (
                        <>
                            <button
                                onClick={signInWithGoogle}
                                className={styles.primaryButton}
                            >
                                Get Started with Google
                            </button>
                            <Link to="/login" className={styles.secondaryButton}>
                                Other Login Options
                            </Link>
                            <div className={styles.guestSection}>
                                <span className={styles.divider}>or</span>
                                <Link to="/session" search={{ guest: true, playlistId: undefined }} className={styles.guestButton}>
                                    🎵 Start Worshiping (Guest)
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <section className={styles.features}>
                <div className={styles.feature}>
                    <div className={styles.featureIcon}>🎵</div>
                    <h3>Song Library</h3>
                    <p>Store songs with chords, lyrics, and multiple arrangements</p>
                </div>

                <div className={styles.feature}>
                    <div className={styles.featureIcon}>🎹</div>
                    <h3>Easy Transpose</h3>
                    <p>Nashville Number System for instant key changes</p>
                </div>

                <div className={styles.feature}>
                    <div className={styles.featureIcon}>📺</div>
                    <h3>Live Viewports</h3>
                    <p>Broadcast lyrics to audience, stage, and instruments</p>
                </div>

                <div className={styles.feature}>
                    <div className={styles.featureIcon}>⛪</div>
                    <h3>Church Ready</h3>
                    <p>Designed for worship teams and congregations</p>
                </div>
            </section>
        </main>
    )
}
