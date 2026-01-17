'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import styles from './page.module.css';
import { useAuth } from '@/contexts/AuthContext';

export default function Home() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (user && !loading) return null; // Prevent flash of landing page

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
            <Link href="/dashboard" className={styles.primaryButton}>
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
              <Link href="/login" className={styles.secondaryButton}>
                Other Login Options
              </Link>
              <div className={styles.guestSection}>
                <span className={styles.divider}>or</span>
                <Link href="/session?guest=true" className={styles.guestButton}>
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
  );
}
