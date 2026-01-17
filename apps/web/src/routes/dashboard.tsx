import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import type { Song } from '@laudasist/shared'
import styles from './dashboard.module.css'

export const Route = createFileRoute('/dashboard')({
    component: DashboardPage,
})

function DashboardPage() {
    const navigate = useNavigate()
    const { user, loading: authLoading, signOut } = useAuth()
    const [favorites, setFavorites] = useState<Song[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!authLoading && !user) {
            navigate({ to: '/login' })
        }
    }, [user, authLoading, navigate])

    useEffect(() => {
        async function fetchFavorites() {
            if (user) {
                try {
                    const res = await api.get<{ data: Song[] }>('/api/users/me/favorites')
                    setFavorites(res.data)
                } catch (error) {
                    console.error('Failed to fetch favorites', error)
                } finally {
                    setLoading(false)
                }
            }
        }

        if (user) {
            fetchFavorites()
        }
    }, [user])

    const handleLogout = async () => {
        await signOut()
        navigate({ to: '/' })
    }

    if (authLoading || (!user && loading)) {
        return <div className={styles.container}>Loading...</div>
    }

    if (!user) return null

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>Dashboard</h1>
                    <p className={styles.welcome}>Welcome back, {user.displayName}</p>
                </div>
                <div className={styles.headerActions}>
                    <Link to="/library/new" className={styles.button}>
                        + New Song
                    </Link>
                    <button onClick={handleLogout} className={styles.logoutButton}>
                        Logout
                    </button>
                </div>
            </header>

            <div className={styles.heroAction}>
                <Link to="/session" search={{ guest: false }} className={styles.startSessionButton}>
                    <span className={styles.playIcon}>▶</span>
                    <div>
                        <span className={styles.buttonTitle}>Start Playing</span>
                        <span className={styles.buttonSubtitle}>Instant Worship Session</span>
                    </div>
                </Link>
            </div>

            <div className={styles.grid}>
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Favorite Songs</h2>
                        <Link to="/library" search={{ filter: 'favorites' }} className={styles.link}>
                            View All
                        </Link>
                    </div>
                    {loading ? (
                        <p>Loading favorites...</p>
                    ) : favorites.length > 0 ? (
                        <ul className={styles.songList}>
                            {favorites.slice(0, 5).map((song) => (
                                <li key={song.id} className={styles.songItem}>
                                    <div>
                                        <div className={styles.songTitle}>{song.title}</div>
                                        <div className={styles.songMeta}>
                                            {song.author} • Key: {song.originalKey}
                                        </div>
                                    </div>
                                    <Link to="/library/$id" params={{ id: song.id }} className={styles.link}>
                                        View
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.welcome}>No favorite songs yet.</p>
                    )}
                </section>

                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>Quick Links</h2>
                    </div>
                    <div className={styles.actions} style={{ flexDirection: 'column' }}>
                        <Link to="/library" className={styles.link}>
                            Browse Song Library
                        </Link>
                        {/* <Link to="/services" className={styles.link}>
                            Manage Services (Coming Soon)
                        </Link>
                        <Link to="/profile" className={styles.link}>
                            Edit Profile
                        </Link> */}
                        <span className={styles.link} style={{ opacity: 0.5 }}>Manage Services (Coming Soon)</span>
                        <span className={styles.link} style={{ opacity: 0.5 }}>Edit Profile (Coming Soon)</span>
                    </div>
                </section>
            </div>
        </div>
    )
}
