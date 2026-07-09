/** Romanian catalog — the default locale. Keep keys in sync with en.ts. */
export const ro = {
  // Generic
  'common.loading': 'Se încarcă…',
  'common.empty': 'Nimic aici încă',
  'common.close': 'Închide',
  'common.key': 'Tonalitate',
  'common.tempo': 'Tempo',

  // Platform hub

  // Library

  // Song detail

  // Karaoke

  // Session
  'session.presenters': 'Prezentatori',
  'session.section': 'Secțiune',
  'session.noSong': 'Nicio cântare selectată',
  'session.pickSong': 'Alege o cântare',

  // Stage / presenter

  // Curation

  // LauDJ panel
  'laudj.title': 'LauDJ — consolă',
  'laudj.connected': 'Conectat (motor audio local)',
  'laudj.disconnected': 'Deconectat',
  'laudj.pairHint': 'Scanează QR pe tabletă pentru a controla',
  'laudj.mode.padsOnly': 'Doar paduri',
  'laudj.mode.fullEngine': 'Motor complet',
  'laudj.autoAdvance': 'Avans automat',
  'laudj.yielded': 'Cedat prezentatorului uman',
  'laudj.resume': 'Reia avansul automat',
  'laudj.mixer': 'Mixer stem-uri',
  'laudj.master': 'Master',
  'laudj.mute': 'Mut',
  'laudj.solo': 'Solo',
  'laudj.stem.vocals': 'Voce',
  'laudj.stem.bass': 'Bas',
  'laudj.stem.drums': 'Tobe',
  'laudj.stem.other': 'Altele',
  'laudj.transport': 'Transport',
  'laudj.play': 'Redă',
  'laudj.pause': 'Pauză',
  'laudj.sections': 'Lansator de secțiuni',
  'laudj.transition': 'Tranziție',
  'laudj.transition.immediate': 'Imediat',
  'laudj.transition.quantized': 'Cuantizat',
  'laudj.transition.queued': 'La coadă',
  'laudj.pads': 'Paduri',
  'laudj.pad.style': 'Stil',
  'laudj.pad.volume': 'Volum',
  'laudj.pad.interlude': 'Interludiu',
  'laudj.followSession': 'Urmărește sesiunea',
  'laudj.session.none': 'Nicio sesiune activă',
  'laudj.session.codePlaceholder': 'Cod',
  'laudj.session.join': 'Intră în sesiune',
  'laudj.session.leave': 'Ieși',

  // --- laudj extra keys ---
  'laudj.pair': 'Asociază',
  'laudj.pair.title': 'Asociere tabletă',
  'laudj.crossfade': 'Crossfade (s)',
  'laudj.mockSongs': 'Cântări simulate — emulatorul e gol',
  'laudj.pad.start': 'Pornește padurile',
  'laudj.pad.stop': 'Oprește padurile',
  'laudj.pad.chord': 'Acord curent',
  'laudj.padstyle.warm': 'Cald',
  'laudj.padstyle.bright': 'Luminos',
  'laudj.padstyle.shimmer': 'Sclipitor',
  'laudj.padstyle.deep': 'Profund',

  // --- platform views extra keys ---

  // --- laudj queue keys ---
  'laudj.queue': 'Coadă de părți',
  'laudj.queue.start': 'Pornește coada',
  'laudj.queue.clear': 'Golește',
  'laudj.queue.empty': 'Coada e goală — trage părți aici sau apasă +',
  'laudj.queue.add': 'Adaugă în coadă',
  'laudj.queue.playNow': 'Redă acum',
  'laudj.queue.remove': 'Șterge din coadă',
  'laudj.queue.crescendo': 'Crescendo',
  'laudj.queue.drop': 'Drop',
  'laudj.queue.solo.none': 'Solo: fără',
  'laudj.queue.solo.stem': 'Solo: {stem}',
  'laudj.queue.nowPlaying': 'În redare',
  'laudj.queue.dragHint': 'Trage pentru a reordona',

  // --- LaudStudio extraction UI keys ---
  'extract.title': 'Extrage o cântare',
  'extract.youtube': 'Link YouTube (cântare cu versuri pe ecran)',
  'extract.reference': 'Link partitură de referință (opțional, melodia.ro)',
  'extract.start': 'Extrage',
  'extract.hint': 'Extragerea durează câteva minute: descărcare, OCR versuri, separare stem-uri, analiză acorduri, ingest.',
  'extract.jobs': 'Extrageri',
  'extract.empty': 'Nicio extragere încă',
  'extract.status.queued': 'În așteptare',
  'extract.status.running': 'Rulează',
  'extract.status.done': 'Gata',
  'extract.status.error': 'Eroare',
  'extract.stage.download': 'Descărcare',
  'extract.stage.ocr': 'Versuri (OCR)',
  'extract.stage.stems': 'Stem-uri',
  'extract.stage.analysis': 'Analiză',
  'extract.stage.assemble': 'Asamblare',
  'extract.stage.ingest': 'Ingest',
  'extract.stage.validation': 'Validare',
  'extract.openSong': 'Deschide cântarea',
  'extract.link': 'Leagă în bibliotecă',
  'extract.linking': 'Se leagă…',
  'extract.serviceDown': 'Serviciul de extragere nu rulează (npm run poc îl pornește)',
} as const;

export type MessageKey = keyof typeof ro;
