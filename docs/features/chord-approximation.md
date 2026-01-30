# Chord Approximation Feature

## Overview

The chord approximation feature allows users to copy chord patterns from one song part to another, automatically positioning the chords based on text alignment. This is particularly useful when multiple verses or choruses share similar lyrical structure but have different lyrics.

## Current Implementation (v1.0)

### Functionality

1. **Part-to-Part Chord Transfer**
   - Each song part has a chord approximation button (♪) in its header
   - Clicking the button reveals a dropdown menu with all other parts in the song
   - Selecting a source part copies its chord pattern to the target part

2. **Line Mapping**
   - Each line in the target part receives chords from the corresponding line in the source part
   - If the target part has more lines than the source part, the chord pattern loops/repeats
   - Example: If source has 2 lines and target has 5 lines:
     - Target line 0 ← Source line 0
     - Target line 1 ← Source line 1
     - Target line 2 ← Source line 0 (loop)
     - Target line 3 ← Source line 1 (loop)
     - Target line 4 ← Source line 0 (loop)

3. **Chord Positioning (Character-based)**
   - **Current Method**: Proportional character positioning
   - Chords are positioned based on their relative position in the source text
   - Formula: `targetCharIndex = (sourceCharIndex / sourceTextLength) * targetTextLength`
   - Example:
     ```
     Source: "Amazing grace" (13 chars) with chord at index 8
     Target: "How great thou art" (18 chars)
     Chord position: (8 / 13) * 18 ≈ 11
     ```

### Code Structure

#### Shared Package (`packages/shared/src/chords/approximation.ts`)

**Exported Functions:**

- `approximateChordsFromPart(sourcePart, targetPart, options)` - Main approximation function
  - Parameters:
    - `sourcePart: SongPart` - Source part to copy chords from
    - `targetPart: SongPart` - Target part to apply chords to
    - `options.useSyllables?: boolean` - Use syllable-based positioning (future)
    - `options.language?: Language` - Language for syllable counting ('ro' | 'en')
  - Returns: New `SongPart` with approximated chords

- `copyChordsFromPart(sourcePart, targetPart)` - Exact chord copy (no approximation)
  - Copies chords at exact character positions
  - Only copies to lines that exist in both parts

**Internal Functions:**

- `mapChordPosition()` - Maps chord position from source to target text
- `approximateChordsForLine()` - Approximates chords for a single line
- `calculateSyllablePositions()` - Placeholder for syllable position calculation
- `countSyllables()` - Placeholder for language-specific syllable counting

#### UI Components

**SongPartEditor** (`apps/web/src/components/SongEditor/SongPartEditor.tsx`):
- Added chord approximation button (♪) in part header
- Added dropdown menu for selecting source part
- Props:
  - `allParts: SongPart[]` - All parts in the song
  - `onApproximateChords?: (sourcePartIndex: number) => void` - Callback handler

**SongEditor** (`apps/web/src/components/SongEditor/SongEditor.tsx`):
- Added `handleApproximateChords(targetPartIndex, sourcePartIndex)` handler
- Calls `approximateChordsFromPart` with character-based positioning

**Styles** (`apps/web/src/components/SongEditor/SongEditor.module.css`):
- `.chordSourceMenu` - Dropdown menu container
- `.chordSourceMenuHeader` - Menu header
- `.chordSourceMenuItem` - Individual menu items

## Future Enhancements (v2.0)

### Syllable-Based Positioning

**Goal**: More accurate chord placement based on syllable alignment rather than character count.

**Why Syllables?**
- Better alignment for words of different lengths
- More natural chord placement matching singing patterns
- Example:
  ```
  Source: "A-ma-zing grace" (4 syllables, chord on syllable 1)
  Target: "How great thou art" (4 syllables, chord on syllable 1)

  Character-based: Might misalign due to different word lengths
  Syllable-based: Aligns chords to same syllable position
  ```

### Romanian Syllable Counting (Priority)

**Romanian Syllable Rules:**

1. **Vowels**: a, ă, â, e, i, î, o, u
2. **Diphthongs** (2 vowels, 1 syllable):
   - ea, oa, ia, ie, io, iu, ua, uo, ui
3. **Triphthongs** (3 vowels, 1 syllable):
   - eoa, ioa, iau
4. **General Rules**:
   - Each vowel or vowel group forms one syllable
   - Consonants attach to the nearest vowel
   - Prefixes and suffixes follow standard patterns

**Implementation TODO:**

1. Create syllable detection regex for Romanian
2. Implement `countSyllables(word, 'ro')` function
3. Build syllable position mapping array
4. Test with common Romanian worship songs

### English Syllable Counting (Future)

Similar implementation for English language support:
- Different vowel and diphthong rules
- Handle silent 'e' and special cases
- Common patterns: -tion, -sion, -able, etc.

### Multi-Language Support

**Implementation Plan:**

1. Language detection from song metadata
2. Pluggable syllable counters per language
3. Fallback to character-based for unsupported languages
4. User override option in settings

### UI Improvements

**Planned Enhancements:**

1. **Preview Mode**
   - Show chord approximation preview before applying
   - Highlight differences from current chords
   - Allow manual adjustments before confirming

2. **Approximation Options**
   - Toggle between character-based and syllable-based
   - Adjust sensitivity/strictness
   - Option to preserve existing chords vs. replace all

3. **Batch Operations**
   - Apply same source to multiple target parts at once
   - "Apply to all verses" quick action
   - Undo/redo support

4. **Visual Feedback**
   - Animation when chords are approximated
   - Success/warning indicators
   - Conflict warnings (e.g., very different line lengths)

## Testing Checklist

### Current Implementation

- [x] Basic chord approximation works
- [x] Line looping for longer target parts
- [x] UI dropdown menu renders correctly
- [ ] Character-based positioning accuracy
- [ ] Edge cases (empty lines, special characters)
- [ ] Multiple chord positions per line

### Future Implementation

- [ ] Romanian syllable counting accuracy
- [ ] English syllable counting accuracy
- [ ] Syllable-based positioning accuracy
- [ ] Performance with long songs
- [ ] User feedback and refinement

## Known Limitations

1. **Character-based positioning** is approximate and may not align perfectly for:
   - Words with very different lengths
   - Lines with different rhythmic patterns
   - Songs with complex phrasing

2. **No preview** - Changes are applied immediately without preview

3. **No undo** - Users must manually revert changes (standard song editor undo would help)

4. **No conflict detection** - Doesn't warn if source and target have very different structures

## API Reference

### approximateChordsFromPart

```typescript
function approximateChordsFromPart(
  sourcePart: SongPart,
  targetPart: SongPart,
  options?: {
    useSyllables?: boolean;  // Default: false
    language?: 'ro' | 'en';  // Default: 'ro'
  }
): SongPart
```

**Example:**

```typescript
import { approximateChordsFromPart } from '@laudasist/shared';

// Character-based approximation
const updatedPart = approximateChordsFromPart(verse1, verse2);

// Future: Syllable-based approximation
const updatedPart = approximateChordsFromPart(verse1, verse2, {
  useSyllables: true,
  language: 'ro'
});
```

## Related Features

- Song Editor (parent feature)
- Nashville Chord System (underlying chord representation)
- Chord drag-and-drop (alternative chord editing method)
- Song transposition (changes all chords globally)

## References

- Romanian phonology: https://en.wikipedia.org/wiki/Romanian_phonology
- Syllabification algorithms: https://en.wikipedia.org/wiki/Syllabification
- Nashville Number System: `docs/DATA_MODELS.md`
