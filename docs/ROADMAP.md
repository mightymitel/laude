# Roadmap

MVP phases and implementation timeline.

---

## Phase 1: Foundation

**Focus**: Core infrastructure and personal features

- [ ] Firebase Authentication (Google, Facebook, Apple, Email)
- [ ] User Dashboard (recently played, saved playlists, library, favorites)
- [ ] Personal Song Library (CRUD)
- [ ] Song creation with Nashville Number chord notation
- [ ] Song search (name, author, tags, lyrics)

---

## Phase 2: Fast Service

**Focus**: Quick worship leading

- [ ] User Fast Service (local view only)
- [ ] 2-column presenter UI
- [ ] Real-time chord transposition
- [ ] Chord display options (Nashville/Letters/Roman)

*See [Worship Session](./features/worship-session.md) for details*

---

## Phase 3: Viewports & Community

**Focus**: Broadcasting and public libraries

### Viewports
- [ ] `audience` — Full screen lyrics, fullscreen button
- [ ] `stage` — Lyrics + chords above for musicians
- [ ] `instrument` — Chords + lyrics + next part preview
- [ ] `subtitles` — High-contrast large text for overlays
- [ ] Session Key Preference toggle

### Community
- [ ] Real-time viewport broadcasting via Socket.io
- [ ] Worship Session Sharing (Go Live)
- [ ] Guest user viewport access via link

### Phase 3B: Guest Features
- [ ] Community Library (public read-only)
- [ ] Landing Page with "Continue as Guest"
- [ ] Guest Session using community library
- [ ] localStorage favorites for guests
- [ ] Guest limitations (no Go Live, no song creation)

---

## Phase 4: Church Features

**Focus**: Multi-tenant church support

- [ ] Church creation and dashboard
- [ ] Church services
- [ ] Church song library
- [ ] Church member subscriptions
- [ ] Church roles (owner, admin, staff)

---

## Phase 5: Full Live Service

**Focus**: Complete presenter experience

- [ ] 4-column Presenter Dashboard
- [ ] Preview → Live workflow
- [ ] Multi-viewport broadcasting
- [ ] Viewport theming and layout
- [ ] Access links with QR codes
- [ ] Concurrent presenter support

*See [Live Service](./features/live-service.md) for details*

---

## Phase 6: Bible Integration

**Focus**: Scripture support

- [ ] Self-hosted Bible database
- [ ] Translations: NIV, KJV, NTR, VDCC
- [ ] Bible search
- [ ] Bible playlist in services
- [ ] Bible verses as slides
