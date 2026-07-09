# Song Editor

> WYSIWYG song editing with drag-and-drop chord positioning.

## Overview

A self-contained, mobile-friendly song editor component with two editing modes:
1. **Visual Mode (WYSIWYG)** — Drag-and-drop chords, inline editing
2. **Raw Mode** — Markdown-style text editing (existing QuickAddForm style)

**Container agnostic**: Works in pages, modals, or drawers.

---

## Visual Mode Features

### Chord Positioning
- Drag existing chords to reposition (immediate drag on touch/click)
- While dragging, show caret indicator in lyrics where chord will land
- Drop chord to set new position

### Chord Toolbar
Common chords displayed in current style:
- **Majors**: 1, 4, 5
- **Minors**: 6, 2, 3

**Alterations** (long-press / right-click):
- 3 common presets: `7`, `sus4`, `maj7`
- "Custom" button → input for any alteration

Drag from toolbar to drop into lyrics.

### Chord Style
- Selectable: Letters, Nashville, Roman
- Passed via props (inherits from session context)

### Lyrics Editing
- Inline editable text
- **Lock Lyrics** toggle to prevent accidental edits
- When locked: only chord operations allowed

### Part Management
- Add new parts (verse, chorus, bridge, etc.)
- Remove parts
- Reorder parts via drag
- Edit part labels (e.g., "Verse 1" → "Intro")

### Arrangements
- Create/edit song arrangements
- Define part order for each arrangement
- Set default arrangement

---

## Props Interface

```typescript
interface SongEditorProps {
  // Initial data
  song?: Song;
  
  // Chord display
  chordStyle?: ChordStyle; // Default: 'letters'
  displayKey?: Key;
  
  // Mode
  defaultMode?: 'visual' | 'raw';
  
  // Callbacks
  onSave?: (song: Song) => void;
  onCancel?: () => void;
  
  // Container context
  variant?: 'page' | 'modal' | 'drawer';
}
```

---

## Validation

| Field | Required | Notes |
|-------|----------|-------|
| Title | ✅ Yes | Show error if empty on save |
| Key | Optional | Defaults to C |
| Content | Optional | Can save empty song |

---

## UI Components

```
┌─────────────────────────────────────────┐
│ [Title Input]                    [Mode] │
│ [Author] [Key Selector]                 │
├─────────────────────────────────────────┤
│ Chord Toolbar: [C][F][G][Am][Dm][Em][+] │
├─────────────────────────────────────────┤
│ ┌─ Verse 1 ─────────────────── [✎][×] │
│ │ [Am]Amazing grace how sweet...       │
│ │ That [G]saved a wretch like [C]me    │
│ └──────────────────────────────────────│
│ ┌─ Chorus ──────────────────── [✎][×] │
│ │ ...                                   │
│ └──────────────────────────────────────│
│                          [+ Add Part]   │
├─────────────────────────────────────────┤
│ 🔒 Lock Lyrics    [Arrangements ▾]      │
│            [Cancel]  [Save]             │
└─────────────────────────────────────────┘
```

---

## Mobile Considerations

- Touch-friendly chord targets (min 44px)
- Drag immediately on touch (no long-press required)
- Chord toolbar horizontally scrollable
- Part reordering via drag handles
- Lock lyrics enabled by default on mobile?

---

## Related

- [SongViewer](../../apps/web/src/components/songs/SongViewer.tsx) — Read-only display
- [QuickAddForm](../../apps/web/src/components/songs/QuickAddForm.tsx) — Raw mode reference
- [Chord System](../../packages/shared/README.md) — Nashville number utilities
