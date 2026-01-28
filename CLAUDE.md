# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Laudasist** is a worship assistant app for churches and worship leaders. It manages worship services with real-time multi-viewport broadcasting, song libraries with chord transposition, and presenter dashboards.

## Commands

```bash
# Development
npm run dev           # Start all apps (web + api)
npm run dev:web       # Start only frontend (Vite)
npm run dev:api       # Start only backend (Express)

# Build
npm run build         # Build all workspaces
npm run apphosting:build  # Build for Firebase App Hosting

# Testing
npm run test          # Run all unit tests (Jest)
npm run test:e2e      # Run E2E tests (Playwright)

# Code Quality
npm run lint          # ESLint all workspaces

# Deployment
npm run deploy        # Build and deploy to Firebase
```

## Architecture

### Monorepo Structure

- **apps/web/** - React 19 + Vite frontend with TanStack Router/Query
- **apps/api/** - Express + Socket.io backend with Firebase Admin
- **packages/shared/** - Shared types, utilities, Nashville chord system
- **tests/e2e/** - Playwright E2E tests

### Real-Time Architecture

Socket.io connects presenters to viewports. Events flow: Presenter → API Server → Viewports.

Key Socket.io events:
- `join-viewport` - Client joins a viewport broadcast room
- `slide-change` - Server broadcasts current slide to viewports
- `viewport-update` - Server broadcasts theme/layout changes
- `service-status` - Server broadcasts live/ended status

### Chord System (Nashville Numbers)

Chords are stored as Nashville Numbers for transposition. Entry point: `packages/shared/src/chords/nashville.ts`

- `parseAnyChord(chord, key)` - Detects format, converts to Nashville
- `formatChord(chord, key, style)` - Renders to display format (C, I, 1)
- `extractChordsFromLine(line)` - Parses `[brackets]` from lyrics
- `embedChordsInLine(text, chords)` - Reconstructs line with chords

Chord positioning in lyrics: `  [1]Amazing [4]grace how [5]sweet the sound`

### Data Flow

TanStack Query manages client cache. Socket.io events trigger cache invalidation. Optimistic updates for responsive UI.

## Code Standards

- **Styling**: CSS Modules only (`*.module.css`). No inline styles except dynamic values
- **File Length**: Max 250 lines. Refactor if larger
- **TypeScript**: Strict mode enabled
- **Shared Logic**: Reusable code goes in `packages/shared`

## Pre-Push Checklist

**IMPORTANT**: Never consider a task complete or push changes until:

1. `npm run build` succeeds with no errors
2. `npm run test` passes all unit tests
3. `npm run lint` passes with no errors

Run these commands before every commit/push.

## Key Domain Concepts

### Song Libraries

| Library | Owner | Visibility |
|---------|-------|------------|
| Official | Platform | Public |
| Community | Platform | Public |
| Church | Church | Public/Private |
| User | User | Public/Private |

### Service Modes

1. **Edit** - Preparation mode
2. **Live** - Broadcasting to viewports
3. **Archived** - Completed service

### Viewport Types

- **audience** - Full screen lyrics for projection
- **stage** - Lyrics + chords for musicians
- **instrument** - Chords + lyrics + next part preview
- **phone** - Mobile-optimized view
- **subtitles** - High-contrast text for overlays

## Path Aliases

- `@/*` → `apps/web/src/*`
- `@laudasist/shared` → `packages/shared`

## Documentation (docs/)

Detailed specs and design decisions belong in `docs/`, not in CLAUDE.md.

| File | Purpose |
|------|---------|
| OVERVIEW.md | Core concepts, user roles, service modes |
| ARCHITECTURE.md | Tech stack, project structure, data flow |
| DATA_MODELS.md | TypeScript interfaces, Nashville chord notation |
| API.md | Socket.io events, REST endpoints |
| RULES.md | Coding standards |
| ROADMAP.md | MVP phases and progress |
| FUTURE.md | Open questions, future features |
| features/*.md | Detailed feature specifications |
| examples/*.md | Song format examples |

When requirements change, update the relevant docs file.
