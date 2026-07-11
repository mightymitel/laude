# API

Real-time communication and API endpoints.

---

## Socket.io Events

### Service Room

**Room identifier**: `service:{serviceId}`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `join-viewport` | Client→Server | `{ viewportId }` | Join viewport broadcast room |
| `slide-change` | Server→Client | `{ slideData, partId }` | Current slide updated |
| `viewport-update` | Server→Client | `{ theme, layout }` | Viewport settings changed |
| `service-status` | Server→Client | `{ status }` | Service went live/ended |

### Session Events

**Room identifier**: `session:{accessCode}`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `session:join` | Client→Server | `accessCode` | Join session room |
| `session:leave` | Client→Server | `accessCode` | Leave session room |
| `state:changed` | Bidirectional | `{ accessCode }` | Notify clients to refetch state (for big changes) |
| `state:sync` | Server→Client | `Partial<SessionState>` | Direct state update (for fast changes) |
| `part:change` | Client→Server | `{ accessCode, partIndex }` | Fast part navigation |
| `key:change` | Client→Server | `{ accessCode, key }` | Fast key change |
| `song:change` | Client→Server | `{ accessCode, songId, song?, partIndex, key }` | Song selection |
| `session:end` | Bidirectional | `accessCode` | Session ended |

**Fast vs Notify-to-Pull:**
- `part:change` → `state:sync`: Direct update for instant part navigation (~50ms)
- `state:changed` → HTTP refetch: For larger changes like song selection (~500ms)

---

## REST Endpoints

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sessions` | Create new live session |
| `GET` | `/api/sessions/:code` | Get session by code |
| `PATCH` | `/api/sessions/:code` | Update session state |

### Songs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/songs` | List songs. Default scope (no filters) = own + community (public) + official, merged; explicit `ownerId`/`libraryType`/`visibility`/`tags` filters keep single-query semantics |
| `POST` | `/api/songs` | Create new song |
| `GET` | `/api/songs/:id` | Get song by ID |
| `PUT` | `/api/songs/:id` | Update song |
| `DELETE` | `/api/songs/:id` | Delete song |

---

## State Synchronization

TanStack Query manages client-side state with Socket.io for real-time updates.

**Two patterns:**

1. **Notify-to-Pull** (for large changes like song selection):
```typescript
socket.on('state:changed', () => {
  queryClient.invalidateQueries(['sessionState', accessCode]);
});
```

2. **Direct Sync** (for fast changes like part navigation):
```typescript
socket.on('state:sync', (data) => {
  queryClient.setQueryData(['sessionState', accessCode], (prev) => ({ ...prev, ...data }));
});
```
