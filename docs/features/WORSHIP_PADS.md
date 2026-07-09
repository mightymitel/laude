# Worship Pads

## Overview

Worship pads are ambient background audio tracks that play during worship sessions. They provide a musical foundation that enhances the worship experience without requiring additional musicians.

Each pad is a seamless loop tuned to a specific musical key. When the song key changes, the pad automatically transitions to match the new key using a smooth cross-fade.

## User Interface

### Location
The worship pad controls appear in the **session dashboard header** (session owner only), alongside other controls like the Tuner and Go Live buttons.

### Controls
- **Play/Stop Button**: Toggle pad playback on/off
- **Volume Slider**: Adjust pad volume from 0% to 100%
- **Style Selector** (future): Choose between different pad styles

### Visual Indicators
- Loading spinner while audio loads
- Visual feedback when pad is playing (animated or highlighted state)

## Audio Behavior

### Key Matching
- Pads automatically match the current `displayKey` in the session
- When a song is selected, the pad plays in that song's key
- When the user transposes (changes key), the pad follows

### Minor Keys
For minor keys, the pad plays the **relative major**:
| Minor Key | Plays Pad |
|-----------|-----------|
| Am | C |
| Bm | D |
| Cm | Eb |
| Dm | F |
| Em | G |
| Fm | Ab |
| F#m | A |
| Gm | Bb |
| G#m | B |

### Cross-Fade Transitions
When the key changes while a pad is playing:
1. The new key's audio loads in the background
2. Once loaded, a 2.5-second cross-fade begins
3. The old pad fades out while the new pad fades in
4. This creates a seamless, musical transition

### Looping
- Pads loop continuously until the user stops them
- The loop is seamless with no audible gap or click

### Audio Context
- Uses Web Audio API for precise control
- Audio starts on user interaction (browser requirement)
- Buffers are cached to avoid re-downloading

## Pad Styles

### Current: Foundations
The initial pad style "Foundations" from Reawaken Worship provides warm, ambient pads suitable for most worship settings.

### Future Styles (Roadmap)
- **Ambient** - Ethereal, spacious pads
- **Warm** - Fuller, warmer tones
- **Minimal** - Subtle, unobtrusive background
- **Cinematic** - Dramatic, building pads

## Technical Details

### Firebase Storage
- **Bucket**: `gs://laudasist-1c1d2.firebasestorage.app`
- **Files**: Root level, named `Reawaken Worship Pads - {Style} - {NN} {Key}.mp3`
- **Keys available**: A, Bb, B, C, Db, D, Eb, E, F, F#, G, Ab (12 major keys)
- **Rules**: Public read access configured for worship pad audio files (updated 2026-01-29)

### Enharmonic Mapping
Display keys map to pad keys:
| Display Key | Pad File Key |
|-------------|--------------|
| C# | Db |
| D# | Eb |
| Gb | F# |
| G# | Ab |
| A# | Bb |

## Implementation

### Files Created
- `apps/web/src/components/WorshipPad/WorshipPad.tsx` - UI component
- `apps/web/src/components/WorshipPad/useWorshipPad.ts` - Audio engine hook
- `apps/web/src/components/WorshipPad/WorshipPad.module.css` - Component styles
- `packages/shared/src/chords/padKeys.ts` - Key-to-pad mapping utilities

### Files Modified
- `apps/web/src/lib/firebase.ts` - Added Firebase Storage export
- `packages/shared/src/types/index.ts` - Added PadStyle type
- `apps/web/src/routes/session.tsx` - Integrated WorshipPad component

---

# Future Considerations

## Phase 2: Multiple Pad Styles
- Add style selector dropdown to UI
- Load different styles from Firebase Storage
- Remember user's preferred style in localStorage

## Phase 3: Viewer Playback (Optional)
- Allow viewers (stage/instrument viewport) to hear the pad locally
- Sync pad state via Socket.io: `{ padPlaying: boolean, padKey: Key, padStyle: PadStyle }`
- Each viewer controls their own volume

## Phase 4: Advanced Features
- **Fade in/out on play/stop**: Smooth 1s fade instead of abrupt start/stop
- **Preloading**: Preload adjacent keys for faster transitions
- **Offline support**: Service worker caching for offline use
- **Custom pads**: Allow churches to upload their own pad audio files

## Phase 5: Integration Enhancements
- **Auto-play on Go Live**: Option to automatically start pad when session goes live
- **Per-song pad settings**: Remember pad on/off preference per song in playlist
- **Metronome integration**: Sync pad tempo with optional metronome (if pads have tempo)

## Technical Debt / Known Limitations

1. **No offline support**: Pads require network connection
2. **No preloading**: First play of a new key has load latency
3. **Session owner only**: Presenters and viewers cannot control pad (by design)
4. **Single style**: Only "Foundations" style available initially

## Open Questions for Future

1. Should pads persist playing state when refreshing the page?
2. Should pads auto-stop when ending the live session?
3. Should there be a global mute (vs just volume slider)?
4. How to handle very slow networks (loading timeout)?
