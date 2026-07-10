# Docs

> **Source of truth for design is Notion** (Worship Platform → per-app specs,
> Decision Log, Ways of Working), read via the Notion MCP. Spec pages follow
> DEC-114: `Current Implementation` → `Target · MVP/v1/v2` →
> `Old Spec (verbatim)` → `Open Questions` → `Notes`.

## Living documents (kept current, repo-owned)

| Document | Description |
|----------|-------------|
| [Viewport Contract](./VIEWPORT_CONTRACT.md) | The versioned placeholder × declared-class rendering contract (v2) |
| [Kick-offs](./kick-offs/) | Session kickoff prompts, kept for reference |

## Archived reference — the original Laudasist docs (pre-platform)

Everything below documents the **old, frozen Laudasist app** (the one still
deployed from the frozen repo). It is the raw import the Notion
`Old Spec (verbatim)` sections mine — **reference only, never a source of
truth** (DEC-113). Field names (`originalKey`), routes, and architecture
described here predate the platform refactor; where they conflict with the
code or a Notion Target, the code and the Target win.

| Document | Description |
|----------|-------------|
| [Overview](./OVERVIEW.md) | Old project vision, core concepts, decisions |
| [Architecture](./ARCHITECTURE.md) | Old tech stack, file structure, realtime architecture |
| [Data Models](./DATA_MODELS.md) | Old TypeScript interfaces, chord system, permissions |
| [Roadmap](./ROADMAP.md) | Old MVP phases and progress |
| [API](./API.md) | Old socket.io events and REST endpoints |
| [Rules](./RULES.md) | Old coding standards |
| [Future](./FUTURE.md) | Old open questions and ideas |
| [Worship Session](./features/worship-session.md) | Old local-only quick worship mode spec |
| [Live Service](./features/live-service.md) | Old multi-viewport broadcasting spec |
| [Song format examples](./examples/) | resursecrestine.ro song formats (still useful for the importer) |
| [@laudasist/shared](../packages/shared/README.md) | Old shared package (being absorbed into `@laude/*`) |
