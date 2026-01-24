# Architecture

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React (Vite), TanStack Router, TanStack Query, TypeScript, CSS Modules |
| **Backend** | Node.js, Express, Socket.io |
| **Data Fetching** | TanStack Query |
| **Database** | MongoDB |
| **Auth & Storage** | Firebase Authentication, Firebase Storage |
| **Deployment** | Firebase Hosting |
| **Bible Data** | Self-hosted database (NIV, KJV, NTR, VDCC) |

---

## Project Structure

```
laudasist/
├── apps/
│   ├── web/                    # React + Vite frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── package.json
│   └── api/                    # Express backend
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── models/
│       │   ├── socket/
│       │   └── middleware/
│       └── package.json
├── packages/
│   ├── shared/                 # Shared types, utils, chord system
│   └── ui/                     # Shared UI components (Storybook)
├── tests/
│   └── e2e/                    # Playwright E2E tests
├── docs/                       # Documentation
└── package.json                # Monorepo root
```

---

## Real-Time Architecture

### Socket.io Implementation

**Service Room**: `service:{serviceId}`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join-viewport` | Client→Server | `{ viewportId }` | Join viewport broadcast room |
| `slide-change` | Server→Client | `{ slideData, partId }` | Current slide updated |
| `viewport-update` | Server→Client | `{ theme, layout }` | Viewport settings changed |
| `service-status` | Server→Client | `{ status }` | Service went live/ended |

### Scaling Target (Phase 1)
- ~1,000 concurrent live services
- ~5 viewports per service average
- ~5 viewers per viewport average
- Single server instance with MongoDB

---

## Data Flow

```mermaid
graph LR
    A[Presenter] -->|Socket.io| B[API Server]
    B -->|MongoDB| C[(Database)]
    B -->|Socket.io| D[Viewports]
    B -->|Socket.io| E[Other Presenters]
```

### State Synchronization
- TanStack Query manages client-side cache
- Socket.io events trigger cache invalidation
- Optimistic updates for responsive UI
