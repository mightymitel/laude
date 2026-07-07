// UNVERIFIED mock content — generated for the wireframe PoC.
// All lyrics are invented, original placeholder worship text (no real songs).

import type { Lang } from '@laude/song-model';
import type { Key, PartType } from '../laudasist-types';

export interface SeedSectionDef {
  type: PartType;
  /** ChordPro-style lines with inline English chords, e.g. "[G]Ține-mă a[C]proape". */
  lines: string[];
}

export interface SeedSongDef {
  id: string;
  title: string;
  author: string;
  language: Lang;
  key: Key;
  bpm: number;
  tags: string[];
  verified: boolean;
  /** Seed karaoke timing (LRC) for this song. */
  withLrc: boolean;
  sections: SeedSectionDef[];
  /** RO↔EN translation partner (song id); links are written in both directions. */
  translationOf?: string;
}

export const SEED_SONGS: SeedSongDef[] = [
  // -------------------------------------------------------------- Romanian
  {
    id: 'song-aproape-de-tine',
    title: 'Aproape de Tine',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'G',
    bpm: 72,
    tags: ['închinare', 'liniștit'],
    verified: true,
    withLrc: true,
    translationOf: 'song-close-to-you',
    sections: [
      {
        type: 'verse',
        lines: [
          '[G]Ține-mă aproape de [C]Tine, [G]Doamne',
          '[Em7]În liniștea serii Te [C]caut [D]iar',
          '[G]Harul Tău mă poartă pe [C]brațe [G/B]blânde',
          '[Am7]Numele Tău este [D]scut și [G]far',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[C]Aproape de [D]Tine e [G]bine, [Em]bine',
          '[C]Inima [D]mea în pace [Em]stă',
          '[C]Aproape de [D]Tine lu[G/B]mina [Em]vine',
          '[Am7]Rămâi cu [D]mine, nu ple[G]ca',
        ],
      },
      {
        type: 'verse',
        lines: [
          '[G]Când valuri de teamă se-a[C]dună în [G]cale',
          '[Em7]Cuvântul Tău drumul mi-l [C]lumi[D]nează',
          '[G]Nimic nu mă smulge din [C]mâna Ta [G/B]tare',
          '[Am7]Iubirea Ta-n veci mă [D]păs[G]trează',
        ],
      },
    ],
  },
  {
    id: 'song-rau-de-har',
    title: 'Râu de har',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'D',
    bpm: 76,
    tags: ['închinare', 'har'],
    verified: true,
    withLrc: true,
    translationOf: 'song-river-of-grace',
    sections: [
      {
        type: 'verse',
        lines: [
          '[D]Curge peste mine [G]râu de [D]har',
          '[Bm]Apele Tale vii mă [G]spală [A]iar',
          '[D]Setea sufletului [G]Tu o [D]stingi',
          '[Em7]Cu bunătatea Ta mă a[A]tingi',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[G]Râu de [A]har, curgi peste [Bm]noi',
          '[G]Adu-ne [A]viață și ne înno[D]iește',
          '[G]Râu de [A]har, torent de [Bm]sus',
          '[Em7]Umple-ne inima cu [A]pacea Ta de [D]sus',
        ],
      },
      {
        type: 'bridge',
        lines: ['[Bm]Mai adânc, mai a[G]dânc', '[D]În apele Tale mă a[A]runc'],
      },
    ],
  },
  {
    id: 'song-lumina-diminetii',
    title: 'Lumina dimineții',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'C',
    bpm: 68,
    tags: ['dimineață', 'laudă'],
    verified: false,
    withLrc: true,
    translationOf: 'song-morning-light',
    sections: [
      {
        type: 'verse',
        lines: [
          '[C]Lumina dimineții [F]se ridi[C]că',
          '[Am]Peste dealuri cântă [F]zorii [G]noi',
          '[C]Mila Ta în fiecare [F]zi e [C/E]nouă',
          '[Dm7]Credincioșia Ta e [G]peste [C]noi',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[F]Mare ești, [G]mare ești, [C]Doamne',
          '[F]Cerurile [G]spun slava [Am]Ta',
          '[F]Mare ești, [G]mare ești, [C/E]Doamne',
          '[Dm7]În veci Te vom [G]lău[C]da',
        ],
      },
    ],
  },
  {
    id: 'song-inima-mea-canta',
    title: 'Inima mea cântă',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'E',
    bpm: 120,
    tags: ['bucurie', 'laudă'],
    verified: true,
    withLrc: true,
    translationOf: 'song-my-heart-sings',
    sections: [
      {
        type: 'verse',
        lines: [
          '[E]Inima mea cântă, [A]cântă de bucu[E]rie',
          '[C#m7]Tu m-ai ridicat din [A]groapă la [B]viață',
          '[E]Lanțurile mele [A]s-au rupt pe ve[E]cie',
          '[F#m7]Alerg către Tine [B]dis-de-diminea[E]ță',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[A]Cânt, [B]cânt, aleluia [C#m]cânt',
          '[A]Numele Tău îl [B]înalț pe pă[E]mânt',
          '[A]Cânt, [B]cânt, cu tot ce [C#m]sunt',
          '[F#m7]Bucuria Ta e [B]cântecul meu [E]sfânt',
        ],
      },
    ],
  },
  {
    id: 'song-stanca-neclintita',
    title: 'Stânca neclintită',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'A',
    bpm: 74,
    tags: ['încredere'],
    verified: true,
    withLrc: false,
    sections: [
      {
        type: 'verse',
        lines: [
          '[A]Pe stânca neclinti[D]tă stau a[A]cum',
          '[F#m]Furtuna poate [D]bate ne-nce[E]tat',
          '[A]Zidită-i casa mea pe [D]stâncă [A/C#]tare',
          '[Bm7]Nimic n-o va clin[E]ti vreo[A]dat’',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[D]Tu ești [E]stânca [A]mea',
          '[D]Adăpost în [E]vreme [F#m]grea',
          '[D]Neclintit ră[E]mân în [A/C#]Tine',
          '[Bm7]Ancora nă[E]dejdii [A]mele',
        ],
      },
    ],
  },
  {
    id: 'song-vrednic-e-numele-tau',
    title: 'Vrednic e Numele Tău',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'F',
    bpm: 66,
    tags: ['închinare', 'adorare'],
    verified: false,
    withLrc: true,
    sections: [
      {
        type: 'verse',
        lines: [
          '[F]Vrednic e Numele [Bb]Tău de sla[F]vă',
          '[Dm]Toată suflarea Te a[Bb]doră-n [C]cor',
          '[F]Sfânt ești, Doamne, plin de-ndu[Bb]rare [F/A]iarăși',
          '[Gm7]Ție-Ți cântăm cu [C]drag și [F]dor',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[Bb]Vrednic, [C]vrednic, [F]Mielul [Dm]sfânt',
          '[Bb]Cinste și pu[C]tere-n veci pri[F]mește',
          '[Bb]Vrednic, [C]vrednic pe pă[Dm]mânt',
          '[Gm7]Și-n cer Numele [C]Tău dom[F]nește',
        ],
      },
    ],
  },
  {
    id: 'song-peste-ape',
    title: 'Peste ape',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'D',
    bpm: 80,
    tags: ['credință'],
    verified: true,
    withLrc: true,
    sections: [
      {
        type: 'verse',
        lines: [
          '[D]Mă chemi peste ape a[G]dânci, neștiu[D]te',
          '[Bm]Pășesc doar privind către [G]Tine, [A]Domn',
          '[D]Când vântul se-nalță și [G]valul mă-nspăimân[D]tă',
          '[Em7]Tu-mi întinzi mâna, mă [A]scoți din [D]somn',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[G]Peste [A]ape merg cu [Bm]Tine',
          '[G]Frica [A]mea s-a îne[D]cat',
          '[G]Peste [A]ape, tot mai [Bm]bine',
          '[Em7]Pe cuvântul Tău [A]am ple[D]cat',
        ],
      },
    ],
  },
  {
    id: 'song-cantare-in-noapte',
    title: 'Cântare în noapte',
    author: 'Echipa Laude (mock)',
    language: 'ro',
    key: 'G',
    bpm: 64,
    tags: ['seară', 'liniștit'],
    verified: false,
    withLrc: false,
    sections: [
      {
        type: 'verse',
        lines: [
          '[G]În miez de noapte-Ți [C]cânt o cân[G]tare',
          '[Em]Stelele tac, dar [C]inima [D]nu',
          '[G]Tu veghezi peste-a mea [C]cără[G/B]rare',
          '[Am7]Somnul cel dulce mi-l [D]dărui [G]Tu',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[C]Cântare-n [D]noapte, psalm în [Em]zori',
          '[C]Lauda Ta nu [D]va tă[G]cea',
          '[C]De mii de [D]ori, de mii de [Em]ori',
          '[Am7]Te va slăvi [D]inima [G]mea',
        ],
      },
    ],
  },
  // --------------------------------------------------------------- English
  {
    id: 'song-close-to-you',
    title: 'Close to You',
    author: 'Laude Collective (mock)',
    language: 'en',
    key: 'G',
    bpm: 72,
    tags: ['worship', 'quiet'],
    verified: true,
    withLrc: true,
    translationOf: 'song-aproape-de-tine',
    sections: [
      {
        type: 'verse',
        lines: [
          '[G]Keep me ever close be[C]side You, [G]Father',
          '[Em7]In the quiet evening [C]I seek Your [D]face',
          '[G]Your mercy carries me on [C]gentle [G/B]shoulders',
          '[Am7]Your holy name my [D]shield and [G]place',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[C]Close to [D]You my soul finds [G]shelter, [Em]shelter',
          '[C]My restless [D]heart is stilled in [Em]peace',
          '[C]Close to [D]You the morning [G/B]light is [Em]breaking',
          '[Am7]Stay here with [D]me and never [G]cease',
        ],
      },
      {
        type: 'verse',
        lines: [
          '[G]When waves of fear are ris[C]ing all a[G]round me',
          '[Em7]Your living word will [C]light my [D]way',
          '[G]No power can take me from [C]Your hand that [G/B]holds me',
          '[Am7]Your steadfast love is [D]here to [G]stay',
        ],
      },
    ],
  },
  {
    id: 'song-river-of-grace',
    title: 'River of Grace',
    author: 'Laude Collective (mock)',
    language: 'en',
    key: 'D',
    bpm: 76,
    tags: ['worship', 'grace'],
    verified: true,
    withLrc: true,
    translationOf: 'song-rau-de-har',
    sections: [
      {
        type: 'verse',
        lines: [
          '[D]Flowing over me a [G]river of [D]grace',
          '[Bm]Your living waters wash me [G]clean a[A]gain',
          '[D]Every thirst inside me [G]You e[D]rase',
          '[Em7]Your kindness falls on me like [A]rain',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[G]River of [A]grace, flow over [Bm]us',
          '[G]Bring us to [A]life, make all things [D]new',
          '[G]River of [A]grace, torrent a[Bm]bove',
          '[Em7]Fill every heart with [A]peace from [D]You',
        ],
      },
      {
        type: 'bridge',
        lines: ['[Bm]Deeper still, deeper [G]still', '[D]Into Your waters I [A]fall'],
      },
    ],
  },
  {
    id: 'song-morning-light',
    title: 'Morning Light',
    author: 'Laude Collective (mock)',
    language: 'en',
    key: 'C',
    bpm: 68,
    tags: ['morning', 'praise'],
    verified: false,
    withLrc: false,
    translationOf: 'song-lumina-diminetii',
    sections: [
      {
        type: 'verse',
        lines: [
          '[C]The morning light is [F]rising [C]slowly',
          '[Am]Over the hills the [F]dawn sings [G]new',
          '[C]Your mercies every [F]day are [C/E]holy',
          '[Dm7]Your faithfulness comes [G]shining [C]through',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[F]Great You are, [G]great You are, [C]Father',
          '[F]All the heavens [G]tell Your [Am]fame',
          '[F]Great You are, [G]great You are, [C/E]Father',
          '[Dm7]Forever we will [G]praise Your [C]name',
        ],
      },
    ],
  },
  {
    id: 'song-my-heart-sings',
    title: 'My Heart Sings',
    author: 'Laude Collective (mock)',
    language: 'en',
    key: 'E',
    bpm: 120,
    tags: ['joy', 'praise'],
    verified: true,
    withLrc: false,
    translationOf: 'song-inima-mea-canta',
    sections: [
      {
        type: 'verse',
        lines: [
          '[E]My heart is singing, [A]singing with glad[E]ness',
          '[C#m7]You lifted me from the [A]pit to [B]life',
          '[E]Every chain is broken, [A]gone is my [E]sadness',
          '[F#m7]I run to meet You at [B]morning [E]light',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[A]Sing, [B]sing, hallelujah [C#m]sing',
          '[A]High above the [B]earth Your name I [E]bring',
          '[A]Sing, [B]sing, with every[C#m]thing',
          '[F#m7]The joy You give is [B]why my heart [E]sings',
        ],
      },
    ],
  },
  {
    id: 'song-endless-mercy',
    title: 'Endless Mercy',
    author: 'Laude Collective (mock)',
    language: 'en',
    key: 'A',
    bpm: 78,
    tags: ['mercy', 'worship'],
    verified: false,
    withLrc: false,
    sections: [
      {
        type: 'verse',
        lines: [
          '[A]Endless mercy, morning [D]after [A]morning',
          '[F#m]You meet me at the [D]break of [E]day',
          '[A]Grace upon grace like the [D]sunrise [A/C#]dawning',
          '[Bm7]You wash my every [E]fear a[A]way',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[D]Endless, [E]endless is Your [F#m]love',
          '[D]Higher than the [E]heavens a[A]bove',
          '[D]Deeper than the [E]oceans [F#m]roll',
          '[Bm7]Your endless mercy [E]fills my [A]soul',
        ],
      },
    ],
  },
  {
    id: 'song-we-lift-you-high',
    title: 'We Lift You High',
    author: 'Laude Collective (mock)',
    language: 'en',
    key: 'D',
    bpm: 128,
    tags: ['celebration', 'praise'],
    verified: true,
    withLrc: false,
    sections: [
      {
        type: 'verse',
        lines: [
          '[D]We come with a shout, we [G]come with a [D]song',
          '[Bm]Lifting our voices to[G]gether as [A]one',
          '[D]You are the reason we [G]sing all day [D]long',
          '[Em7]Praise to the Father, the [A]Spirit, the [D]Son',
        ],
      },
      {
        type: 'chorus',
        lines: [
          '[G]We lift You [A]high, we lift You [Bm]high',
          '[G]Let all the [A]earth declare Your [D]name',
          '[G]We lift You [A]high, we lift You [Bm]high',
          '[Em7]Forever [A]You remain the [D]same',
        ],
      },
    ],
  },
];

export function getSeedSong(id: string): SeedSongDef {
  const song = SEED_SONGS.find((s) => s.id === id);
  if (!song) throw new Error(`Unknown seed song id: ${id}`);
  return song;
}
