import { Button, Card } from '@laude/design-system';
import { useT } from '@laude/i18n/react';

/** Wireframe pairing target — the real engine advertises this on the LAN. */
const PAIR_URL = 'ws://laudj.local:9000';

const QR_SIZE = 21;

/** Deterministic fake QR: seeded noise + the three finder squares. */
function qrModules(): boolean[][] {
  let seed = 0x1a0d7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const grid = Array.from({ length: QR_SIZE }, () =>
    Array.from({ length: QR_SIZE }, () => next() < 0.45),
  );
  const finder = (top: number, left: number) => {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[top + r][left + c] = ring || core;
      }
    }
  };
  finder(0, 0);
  finder(0, QR_SIZE - 7);
  finder(QR_SIZE - 7, 0);
  return grid;
}

const MODULES = qrModules();

export function PairOverlay({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="laudj-overlay" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}>
        <Card>
          <div className="ld-label">{t('laudj.pair.title')}</div>
          <div className="laudj-qr">
            <svg width={168} height={168} viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} role="img">
              {MODULES.flatMap((row, r) =>
                row.map((on, c) =>
                  on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#111" /> : null,
                ),
              )}
            </svg>
          </div>
          <div className="laudj-lanurl">{PAIR_URL}</div>
          <div className="ld-label">{t('laudj.pairHint')}</div>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </Card>
      </div>
    </div>
  );
}
