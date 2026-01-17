# Project Rules & Standards

## Technology Stack
- **Component Verification**: Storybook must be used to verify individual components.
- **Styling**: CSS Modules (`*.module.css`) must be used. **NO INLINE STYLING** is permitted (except for dynamic values like coordinates).

## Code Quality
- **File Length**: Files must NOT exceed **250 lines**. If a file grows larger, it must be refactored and split into smaller modules or components.
- **Strict Mode**: TypeScript strict mode is enabled and must be adhered to.

## Architecture
- **Shared Logic**: Reusable logic (chords, types) belongs in `packages/shared`.
- **UI Components**: Reusable UI components belong in `packages/ui` (or `components/` if app-specific).

## Documentation
- **User Clarifications**: When the user provides clarifications or new requirements, immediately update:
  - `docs/SPEC.md` - Add/modify relevant sections
  - `implementation_plan.md` - Update affected tasks and scope
