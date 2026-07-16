/** WP-174 / DEC-149: exact-match dedupe → starting default arrangement. */
import { dedupeRepeatedParts } from '../../scrapers/dedupeParts';
import type { SongPart } from '../../shared/index';

const part = (type: SongPart['type'], index: number, ...texts: string[]): SongPart => ({
    id: `${type}-${index}-${Math.abs(texts[0]!.length)}`,
    type,
    index,
    lines: texts.map((text) => ({ text })),
});

describe('dedupeRepeatedParts', () => {
    it('a chorus written out three times becomes ONE part + three refs', () => {
        const chorus = ['[4]Refren [5]sfânt', 'A [1]doua linie'];
        const input = [
            part('verse', 1, '[1]Strofa unu'),
            part('chorus', 1, ...chorus),
            part('verse', 2, '[1]Strofa doi'),
            part('chorus', 2, ...chorus),
            part('chorus', 3, ...chorus),
        ];
        const out = dedupeRepeatedParts(input);
        expect(out.parts.map((p) => `${p.type}${p.index}`)).toEqual(['verse1', 'chorus1', 'verse2']);
        expect(out.defaultArrangement).toEqual(['V1', 'C1', 'V2', 'C1', 'C1']);
    });

    it('NEAR-identical parts stay separate — one changed word must not merge', () => {
        const out = dedupeRepeatedParts([
            part('chorus', 1, 'Sfânt, sfânt e Domnul'),
            part('chorus', 2, 'Sfânt, sfânt e Mielul'), // one word differs
        ]);
        expect(out.parts).toHaveLength(2);
        expect(out.defaultArrangement).toBeUndefined();
    });

    it('same lyrics, different chords stays separate (modulating final chorus)', () => {
        const out = dedupeRepeatedParts([
            part('chorus', 1, '[1]Refren'),
            part('chorus', 2, '[b2]Refren'),
        ]);
        expect(out.parts).toHaveLength(2);
        expect(out.defaultArrangement).toBeUndefined();
    });

    it('same text under a DIFFERENT part type stays separate', () => {
        const out = dedupeRepeatedParts([part('verse', 1, 'La la la'), part('tag', 1, 'La la la')]);
        expect(out.parts).toHaveLength(2);
        expect(out.defaultArrangement).toBeUndefined();
    });

    it('no repeats → parts untouched, NO arrangement emitted', () => {
        const input = [part('verse', 1, 'unu'), part('chorus', 1, 'refren')];
        const out = dedupeRepeatedParts(input);
        expect(out.parts).toHaveLength(2);
        expect(out.defaultArrangement).toBeUndefined();
    });
});
