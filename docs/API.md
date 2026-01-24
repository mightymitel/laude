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

**Room identifier**: `session:{sessionCode}`

| Event | Direction | Payload | Description |
|-------|-----------|---------|-------------|
| `state:changed` | Bidirectional | `SessionState` | Session state synchronization |
| `join` | Client→Server | `{ role }` | Join session room |

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
| `GET` | `/api/songs` | List songs (with filters) |
| `POST` | `/api/songs` | Create new song |
| `GET` | `/api/songs/:id` | Get song by ID |
| `PUT` | `/api/songs/:id` | Update song |
| `DELETE` | `/api/songs/:id` | Delete song |

---

## State Synchronization

TanStack Query manages client-side state with Socket.io for real-time updates:

```typescript
// Socket event triggers query invalidation
socket.on('state:changed', (state) => {
  queryClient.setQueryData(['session', code], state);
});
```
