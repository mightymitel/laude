/** Platform hub: one card per wireframe view + the external LauDJ panel. */
import { createFileRoute, Link } from '@tanstack/react-router';
import { Card } from '@laude/design-system';
import { useT } from '@laude/i18n/react';

export const Route = createFileRoute('/platform/')({
  component: HubPage,
});

const LAUDJ_PANEL_URL = 'http://localhost:5175';

function HubPage() {
  const t = useT();
  const cards = [
    { to: '/platform/library', title: t('hub.library'), desc: t('hub.library.desc') },
    // Karaoke needs a song — the card routes through the library to pick one.
    { to: '/platform/library', title: t('hub.karaoke'), desc: t('hub.karaoke.desc') },
    { to: '/platform/session', title: t('hub.session'), desc: t('hub.session.desc') },
    { to: '/platform/stage', title: t('hub.stage'), desc: t('hub.stage.desc') },
    { to: '/platform/extract', title: t('hub.extract'), desc: t('hub.extract.desc') },
  ] as const;

  return (
    <main className="ld-page ld-vstack">
      <h1>{t('hub.title')}</h1>
      <div className="ld-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {cards.map((card) => (
          <Link key={card.title} to={card.to} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Card>
              <div className="ld-vstack">
                <strong>{card.title}</strong>
                <span className="ld-label">{card.desc}</span>
              </div>
            </Card>
          </Link>
        ))}
        <a href={LAUDJ_PANEL_URL} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Card>
            <div className="ld-vstack">
              <strong>{t('hub.laudj')}</strong>
              <span className="ld-label">{t('hub.laudj.desc')}</span>
              <span className="ld-label">{t('hub.laudj.external', { url: LAUDJ_PANEL_URL })}</span>
            </div>
          </Card>
        </a>
      </div>
    </main>
  );
}
