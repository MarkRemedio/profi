@AGENTS.md

# Project Development Guide

## General Principles

- Understand existing architecture before modifying code.
- Follow existing patterns before introducing new abstractions.
- Do not rewrite unrelated code.
- Prefer small, focused changes.
- Avoid duplicated logic.
- Keep business logic separate from UI logic.
- Never hardcode secrets, credentials, URLs, or environment-specific values.
- Do not modify generated files manually.

## Development Workflow

Before implementing a feature:

1. Inspect relevant existing code.
2. Identify frontend, backend, database, and shared-code impact.
3. Check for existing utilities/components/services that can be reused.
4. Determine whether database migrations or API compatibility changes are required.
5. Implement the smallest complete solution.
6. Test the affected functionality.

## TypeScript

- Prefer strict TypeScript.
- Avoid `any` unless unavoidable.
- Prefer explicit domain types.
- Reuse existing shared types when available.
- Do not duplicate API types between frontend and backend if shared types already exist.

## Backend

- Validate all external input.
- Keep controllers/routes thin.
- Put business logic in the appropriate service/domain layer.
- Check authentication and authorization for protected operations.
- Return consistent API errors.
- Do not expose internal errors or sensitive information.

## Frontend

- Reuse existing components before creating new ones.
- Keep components focused.
- Separate data fetching/business logic from presentation where practical.
- Handle:
  - loading states
  - error states
  - empty states
  - success states
- Maintain responsive behavior.
- Preserve accessibility.

## Database

- Never modify production data directly.
- Use migrations for schema changes.
- Consider backwards compatibility.
- Avoid destructive migrations unless explicitly required.
- Check indexes when adding frequently queried columns or relations.
- Consider transaction boundaries for multi-step writes.

## Testing

For changed functionality, run the relevant:

- type checking
- linting
- unit tests
- integration tests
- build

Do not claim a test passed unless it was actually executed.

## Git

- Do not commit automatically unless requested.
- Do not push automatically unless requested.
- Do not modify unrelated files.
- Do not use destructive Git operations unless explicitly requested.

## Completion

After implementation, report:

1. What changed
2. Important files changed
3. Tests/checks executed
4. Any known limitations
5. Any migration/deployment steps required