Before you do anything: read Decision Log entries **DEC-92 through DEC-117** in Notion, rationale fields included. All of them were written today, after your last session. Several correct things you currently believe. Your context was compacted — do not trust your summary of the last session over what those entries say, and do not trust this prompt over them either, because it compresses them.

Then read the **Laudasist — Platform Backbone** page. It is the scope statement for this session.

Three corrections that will bite you if you skip the above:

- **Chords have always been stored as scale degrees.** There is no legacy letter-chord data anywhere. If you start writing a converter for old data, you have misread something (DEC-106).
- **`current.next_part`, WP-116's playlist migration, and the transport fix were things you decided, not things a spec asked for.** That is now a first-class concept with a label. See rule 4.
- **95/96/97/99 are Done.** The Backbone page said otherwise this morning. It was wrong, you were right, and it has been fixed.

---

# YOLO Session #5

**Goal:** finish the Laudasist demo MVP — user Flows 1 + 2 + 3 — and deploy it.

## Standing rules

1. **No data migrations. No back-compat shims.** (DEC-98) No production data exists anywhere. `laudasist.ro` serves the frozen repo; the merged repo has never deployed. The few test songs in Firestore are disposable.

2. **Sessions carry roles, not identities.** (DEC-104) No resume tokens, no roster re-adoption. A dropped client re-joins with its token; the token carries the role. The roster is allowed to be approximate.

3. **Spec pages have a fixed shape.** (DEC-114) `Current Implementation` → `Target · MVP / v1 / v2` → `Old Spec (verbatim)` → `Open Questions` → `Notes`. You own Current Implementation. The Planner owns the Targets. Each Target states only its delta from the stage before it.

4. **Label your deviations.** (DEC-117) Anything you ship that no Target asked for, or that contradicts one, goes under Current Implementation stamped **⚠️ UNRECONCILED**. Do not quietly fold it in. Do not suppress it. This is not a confession mechanism — WP-96's transport fix was an undocumented deviation and the single most valuable thing you did that session. The Planner clears the labels before the next kickoff, and the answer is often "you were right, the Target moves."

5. **"Fork" means two different things.** In Laudasist it is a library verb: take a community song you don't own and create a new, independently editable song in your private library (DEC-112). In LaudStudio, DEC-68 stands unchanged — no fork verb for charts. Don't cross them.

## Do not touch

- **WP-112** (move the importer's fetch half to LaudStudio) — **BLOCKED**. It would delete the only path for populating the demo library. Its embedded `validate.ts` auth fix is *not* blocked and may land.
- **Library, Search & Song View** — held for a dedicated spec session. The stub page is intent capture, not a spec. Do not start it.
- **Song Grouping**, **Feature Map**, church features, the official library tier, curators, the curation gate.
- WP-76's P2 half: session GC, heartbeat/TTL, write throttling.

---

## Phase A — Structure and cleanup

**A1. Restructure the specs.** (DEC-114/117)
Apply the section order to every spec page. Backfill `Current Implementation` on: Session & Realtime Sync, Viewports, Playlist, Tuner, Chord Notation, Cross-App Integration. `Old Spec (verbatim)` is a **Laudasist-only** section — the platform-wide pages never had one.

Retro-stamp `current.next_part` (WP-117) as **⚠️ UNRECONCILED** on the Session page. Same for anything else you shipped on your own initiative. Update **Ways of Working** with the new page shape and the loop's new step: Decide → Spec → Build → **Reconcile** → Review.

**A2. Remove the migration code.** (DEC-98)
Rip out WP-116's portable-playlist v1→v2 migration. v2 is simply the format; reject v1 files with a clear error. Sweep for any other back-compat shim added on the same reasoning.

## Phase B — The content path

Without this the demo has no songs and cannot happen. It comes before deployment.

**B1. Preserve chord approximation.** (DEC-107)
The approximation function — chords annotated on verse 1, extrapolated onto verses that lack them — lives in `@laudasist/shared`. It must survive the WP-32 absorption into `@laude/chords`, with its tests. It is load-bearing: the source sites only annotate the first verse.

**B2. Adapt the importer + SongEditor to the platform contract.**
Keep the URL fetch and the `melodia.ro` / `resursecrestine.ro` scrapers exactly where they are. Adapt to: `default_key` (not `original_key`, per WP-111), the `@laude/song-model` split, denormalized `song_lyrics` visibility (DEC-32), degrees round-trip through `convertChordPro` (DEC-46). **Imports default to private** (DEC-108).

The verbatim editor spec on the **Original Laudasist Specs** page becomes this feature's `Target · MVP` section. Move it there; write `Current Implementation` yourself.

**B3. Publish a private song to community.** (DEC-108)
Owner-only visibility flip on the song doc *and* its denormalized `song_lyrics` copy, plus a search-reindex ping — the same path you used for mint in WP-114. Until this exists, nothing imported is findable by a presenter, because DEC-39 has presenters searching public/official only.

*Acceptance:* import a song from melodia.ro → edit it → approximate chords across verses → publish → **a second account finds it in presenter search.**

## Phase C — Flow 3

**C1. Persisted session, narrow.** (DEC-96/99)
`{id, ownerId, name, playlist-by-value, created/updated}` + owner-scoped Firestore rules + a "my sessions" list + open-into-session + repeatable go-live.

Explicitly out: Edit/Live/Archived lifecycle, church scoping, comments, persisted viewport setups. Build directly from the decision — no spec page gates this. Write the resulting `Current Implementation` section.

## Phase D — The REST session surface

**D1. WP-76, P1 half only.** (DEC-105)
- `PUT /update/:accessCode` currently writes as the literal role `'rest'` with no authorization. Require the **presenter token** in an `Authorization` header; stamp the role from the token. The access code stays a lookup key — Flow 3 has the owner posting it in a group chat, so it was never a credential.
- Add `GET /now-playing` (song, part, directives) and `GET /playlist` for non-socket.io callers. Directives ride in the now-playing payload.
- **No version counter, no delta polling, no directives-as-state.** All three were considered and rejected.

Context: socket.io already rides long-polling in production — your own WP-96 finding. REST is *not* a transport fallback; if the backend is down, both are down. It exists for scripts, a foot pedal, LauDJ's desktop shell.

## Phase E — App shell

**E1. Entry + guest→authed conversion.** Target-state only; audit the code and choose your own path.
The personal session on page load, Start Playing, the sign-in moment, and what migrates when a guest converts (prefs, minted private songs). Extract `@laude/auth` (WP-34) if it falls out naturally.

## Phase F — Deployment

Last. Everything above green first.

**F1. Env-configurable API base URL.** (DEC-102) The web app reads its API/socket base URL from an env var. No same-origin assumptions anywhere. This keeps the later web-vs-api/relay backend split a config change rather than a refactor.

**F2. Wire the backend.** (DEC-100/102)
- New App Hosting backend **in the existing Firebase project**. Source `laude`, tracked branch **`release`** (create it from main). One backend: web + api + relay.
- **Verify after the first rollout that the live runConfig actually honours `apphosting.yaml`.** The frozen backend has `maxInstances` UNSET — platform default 100 — despite the file pinning 1. A console override may be winning. `maxInstances: 1` is not optional: session state lives in the relay's RAM.
- `minInstances: 0`. The 2.7s cold start on go-live is acceptable.
- Map `laudasist.ro` to the new backend. Transport is polling-first (DEC-91).

**F3. Rules in the release pipeline.** (DEC-103)
Firestore rules and indexes deploy **only** on a `release` merge, in the same pipeline as the rollout, gated on `npm run test:rules`. Never `firebase deploy --only firestore:rules` by hand — rules are project-global and would govern the archived app and any un-rolled-out code.

**F4. Archive the frozen backend** at `old.laudasist.ro`. Deployed, unmaintained, no functional promise. It *will* break once the new rules land, and that is fine. Note it as an archive in the README. Do not spend effort keeping it alive.

---

## End-of-session report

One child page under **Code Sessions**. Include:

- What shipped, per ticket, with commit hashes
- **Every ⚠️ UNRECONCILED entry you created, gathered in one list.** This is the Planner's reconciliation queue and it is the point of the label.
- Assumptions you made that no decision covered
- Anything you found that contradicts a spec or a decision. Say it plainly — you were right about 95/96/97/99 and the Planner was wrong.
- Open questions to fold back into specs

Do not overstate readiness. "Flow 4 working" last session meant "some of Flow 4's mechanics exist" — the persisted session it depends on hadn't been built. Say what a flow can and cannot do.

## Definition of done

Someone who is not you can open `laudasist.ro`, tune a guitar, search the library, open a song, transpose it, hit **Go Live**, send a link to a friend, and watch that friend's screen follow the part changes. And, separately, prepare a session days in advance, save it, and open it again on the night.

Go.
