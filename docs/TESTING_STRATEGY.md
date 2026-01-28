# Testing Strategy

This document outlines the testing approach for Laudasist.

## Test Frameworks

| Location | Framework | Purpose |
|----------|-----------|---------|
| `apps/web` | Vitest + React Testing Library | Component unit tests |
| `apps/api` | Jest + Supertest | API endpoint tests |
| `packages/shared` | Jest | Utility function tests |
| `tests/e2e` | Playwright | End-to-end integration tests |

## Test Organization

### Unit Tests

**Location**: Co-located with source files (`*.test.tsx`, `*.test.ts`)

**What to test**:
- Component rendering and DOM structure
- User interactions (clicks, typing, drag & drop)
- Prop variations and edge cases
- Callback invocations

**Pattern**: Arrange-Act-Assert with descriptive `describe`/`it` blocks

```typescript
describe('ComponentName', () => {
    describe('rendering', () => {
        it('renders expected elements', () => { ... });
    });
    describe('interactions', () => {
        it('handles user action', () => { ... });
    });
});
```

### API Tests

**Location**: `apps/api/src/tests/`

**What to test**:
- REST endpoint responses
- Error handling
- Authentication/authorization
- Database operations (mocked)

### Shared Package Tests

**Location**: `packages/shared/src/tests/`

**What to test**:
- Chord parsing and formatting
- Song parsing utilities
- Type conversions

### E2E Tests

**Location**: `tests/e2e/`

**What to test**:
- Complete user workflows
- Cross-component interactions
- Real-time features (Socket.io)
- Browser-specific behavior

## CSS Module Testing

When testing components that use CSS Modules, use partial class matching:

```typescript
// Query helper for CSS modules (hashed class names)
const queryByClass = (container: HTMLElement, className: string) =>
    container.querySelector(`[class*="${className}"]`);

// For elements with data attributes (more reliable)
const querySegments = (container: HTMLElement) =>
    container.querySelectorAll('[data-segment-index]');
```

**Tip**: Add `data-testid` or `data-*` attributes to key elements for stable selectors.

## Current Test Coverage

| Package | Tests | Coverage |
|---------|-------|----------|
| `apps/api` | 8 | API routes, scrapers |
| `apps/web` | 28 | SongLineEditor component |
| `packages/shared` | 38 | Chord utilities, parsing |
| **Total** | 74 | |

## Running Tests

```bash
# All tests
npm run test

# Specific workspace
npm run test --workspace=web
npm run test --workspace=@laudasist/api
npm run test --workspace=@laudasist/shared

# E2E tests
npm run test:e2e

# Watch mode (development)
cd apps/web && npx vitest
```

## Recommendations

### High Priority

1. **Add tests for remaining web components**:
   - `SongEditor.tsx` - main editor orchestration
   - `EditableSongSegment.tsx` - individual segment behavior
   - `SongPartEditor.tsx` - part management

2. **Add hook tests**:
   - `useSongLineSegments.ts` - segment parsing logic
   - `useLiveSession.ts` - real-time state management

3. **Improve API test coverage**:
   - Add tests for service controller
   - Add tests for song import/scraper endpoints

### Medium Priority

4. **Add integration tests between components**:
   - Test drag & drop between palette and editor
   - Test chord transposition flow

5. **Add more E2E scenarios**:
   - Song creation workflow
   - Live presentation flow
   - Multi-viewport sync

### Best Practices

- **Mock external dependencies**: Firebase, fetch, Socket.io
- **Use `beforeEach`**: Clear mocks between tests
- **Test edge cases**: Empty data, malformed input, error states
- **Keep tests focused**: One assertion concept per test
- **Use descriptive names**: `it('calls onTextChange when text is edited and blurred')`

## Pre-Commit Checklist

Before pushing changes:

```bash
npm run build      # Must succeed
npm run test       # Must pass
npm run lint       # Must pass (or only warnings)
```

## Adding New Tests

1. Create test file next to source: `Component.test.tsx`
2. Import testing utilities and component
3. Set up default props with mocked callbacks
4. Group tests by behavior (`describe` blocks)
5. Use `vi.fn()` for function props (Vitest) or `jest.fn()` (Jest)
6. Clear mocks in `beforeEach`
