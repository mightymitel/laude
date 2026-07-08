/**
 * Platform wireframe layout: design-system theme wrapper, topbar with nav +
 * RO/EN switch, and silent demo sign-in so contract writes pass the rules.
 * Stage and karaoke render in the dark .ld-stage theme; stage drops the chrome.
 */
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import '@laude/design-system/styles.css';
import { Segmented } from '@laude/design-system';
import { LOCALES } from '@laude/i18n';
import { useLocale, useT } from '@laude/i18n/react';
import { ensureDemoSignIn } from '@/platform/demoAuth';

export const Route = createFileRoute('/platform')({
  component: PlatformLayout,
});

function PlatformLayout() {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    ensureDemoSignIn();
  }, []);

  const dark =
    pathname.startsWith('/platform/stage') || pathname.startsWith('/platform/karaoke');
  const minimalChrome = pathname.startsWith('/platform/stage');

  return (
    <div className={dark ? 'ld-stage' : 'ld-app'} style={{ minHeight: '100vh' }}>
      {!minimalChrome && (
        <header className="ld-topbar">
          <Link to="/platform" style={{ color: 'inherit', textDecoration: 'none' }}>
            <strong>{t('app.platform')}</strong>
          </Link>
          <nav className="ld-hstack">
            <Link to="/platform/library">{t('hub.library')}</Link>
            <Link to="/platform/session">{t('hub.session')}</Link>
            <Link to="/platform/stage">{t('hub.stage')}</Link>
            <Link to="/platform/curation">{t('hub.curation')}</Link>
            <Link to="/platform/extract">{t('hub.extract')}</Link>
          </nav>
          <span className="ld-spacer" />
          <Segmented options={LOCALES} value={locale} onChange={setLocale} />
        </header>
      )}
      <Outlet />
    </div>
  );
}
