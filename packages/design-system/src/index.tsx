/**
 * @laude/design-system — wireframe primitives (React).
 * Import '@laude/design-system/styles.css' once per app.
 * The three hero views (Laudasist content, stage/present, LauDJ console) are
 * implemented as the app screens in this PoC, composed from these primitives.
 */
import React, { useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------

export function Button(props: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost';
  big?: boolean;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const cls = [
    'ld-btn',
    props.variant === 'primary' && 'ld-btn--primary',
    props.variant === 'ghost' && 'ld-btn--ghost',
    props.big && 'ld-btn--big',
    props.active && 'ld-btn--active',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.children}
    </button>
  );
}

export function Chip(props: {
  children: React.ReactNode;
  state?: 'default' | 'current' | 'queued' | 'warn';
  onClick?: () => void;
}) {
  const cls = ['ld-chip', props.state && props.state !== 'default' && `ld-chip--${props.state}`]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} onClick={props.onClick} style={props.onClick ? { cursor: 'pointer' } : undefined}>
      {props.children}
    </span>
  );
}

export function Card(props: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div className={`ld-card${props.onClick ? ' ld-card--clickable' : ''}`} onClick={props.onClick}>
      {props.children}
    </div>
  );
}

export function Segmented<T extends string>(props: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <span className="ld-seg">
      {props.options.map((o) => (
        <button
          key={o.id}
          className={o.id === props.value ? 'ld-seg--on' : ''}
          onClick={() => props.onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function Toggle(props: { on: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <span className={`ld-toggle${props.on ? ' ld-toggle--on' : ''}`} onClick={() => props.onChange(!props.on)}>
      <span className="ld-toggle__track">
        <span className="ld-toggle__knob" />
      </span>
      {props.label && <span>{props.label}</span>}
    </span>
  );
}

export function Stepper(props: {
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <span className="ld-stepper">
      <Button onClick={props.onDecrement}>−</Button>
      <span className="ld-stepper__value">{props.value}</span>
      <Button onClick={props.onIncrement}>+</Button>
    </span>
  );
}

/** Touch-draggable vertical fader, 0..1. */
export function Fader(props: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  muted?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const { onChange } = props;
  const setFromPointer = useCallback(
    (clientY: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const v = 1 - (clientY - rect.top) / rect.height;
      onChange(Math.min(1, Math.max(0, v)));
    },
    [onChange],
  );

  return (
    <div className={`ld-fader${props.muted ? ' ld-fader--muted' : ''}`}>
      <div
        ref={trackRef}
        className="ld-fader__track"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons > 0) setFromPointer(e.clientY);
        }}
      >
        <div className="ld-fader__fill" style={{ height: `${props.value * 100}%` }} />
        <div className="ld-fader__thumb" style={{ bottom: `calc(${props.value * 100}% - 7px)` }} />
      </div>
      <span className="ld-label">{props.label}</span>
    </div>
  );
}

export function Meter(props: { level: number }) {
  return (
    <div className="ld-meter">
      <div className="ld-meter__fill" style={{ height: `${Math.min(1, Math.max(0, props.level)) * 100}%` }} />
    </div>
  );
}

export function StatusDot(props: { on: boolean; warn?: boolean }) {
  const cls = ['ld-statusdot', props.on && 'ld-statusdot--on', props.warn && 'ld-statusdot--warn']
    .filter(Boolean)
    .join(' ');
  return <span className={cls} />;
}

export function EmptyState(props: { children: React.ReactNode }) {
  return <div className="ld-empty">{props.children}</div>;
}

// ---------------------------------------------------------------------------
// Chord + lyric tracker (flagship domain component) — pure render, data in.
// ---------------------------------------------------------------------------

export interface TrackerPair {
  chord: string;
  lyrics: string;
}
export interface TrackerLine {
  items: TrackerPair[];
}
export interface TrackerSection {
  label: string;
  lines: TrackerLine[];
}

export function ChordLyricTracker(props: {
  sections: TrackerSection[];
  /** Flat index of the current (karaoke/live) line; -1 = none. */
  currentLine?: number;
  stage?: boolean;
  showChords?: boolean;
}) {
  const showChords = props.showChords ?? true;
  let flat = -1;
  return (
    <div className={`ld-tracker${props.stage ? ' ld-tracker--stage' : ''}`}>
      {props.sections.map((section, si) => (
        <div className="ld-tracker__section" key={si}>
          {section.label && <div className="ld-tracker__sectionlabel">{section.label}</div>}
          {section.lines.map((line, li) => {
            flat += 1;
            const current = props.currentLine !== undefined && props.currentLine === flat;
            const past = props.currentLine !== undefined && props.currentLine > flat;
            const cls = [
              'ld-tracker__line',
              current && 'ld-tracker__line--current',
              past && 'ld-tracker__line--past',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <div className={cls} key={li}>
                {line.items.map((pair, pi) => (
                  <span className="ld-tracker__pair" key={pi}>
                    {showChords && <span className="ld-tracker__chord">{pair.chord || ' '}</span>}
                    <span className="ld-tracker__lyric">{pair.lyrics || ' '}</span>
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
