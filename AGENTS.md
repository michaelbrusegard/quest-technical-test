# AGENTS.md

## Purpose
Guide agents to build and modify a Tauri + React app with a mentor agent grounded in browser history.

## Stack
- Bun, TypeScript
- React 19 + Vite 8
- Tauri v2
- Tailwind v4
- oxlint, oxfmt

## Commands
- Install: `bun install`

### Development
- Frontend: `bun run dev`
- Full app: `bun run tauri dev`

### Build
- Frontend: `bun run build`
- App bundle: `bun run tauri build`

### Quality
- Lint: `bun run lint`
- Lint fix: `bun run lint:fix`
- Lint (Rust): `bun run lint:rs`
- Lint fix (Rust): `bun run lint:rs:fix`
- Format: `bun run fmt`
- Format check: `bun run fmt:check`
- Format (Rust): `bun run fmt:rs`
- Format check (Rust): `bun run fmt:rs:check`

### Testing
- Frontend tests: `bun run test`
- Frontend tests (UI): `bun run test:ui`
- Backend tests (Rust): `bun run test:rs`

Frontend test files go in `src/**/*.{test,spec}.{ts,tsx}`. Vitest config is in `vitest.config.ts` with mocks in `vitest.setup.ts`.

## Structure
- `src/`: React UI (components, agent, memory, data logic)
- `src-tauri/`: native layer (Rust, system/browser access)

## Rules
- Keep concerns separated (data → memory → agent → ui)
- Do not access OS data from frontend; use Tauri
- Normalize all browser data before use
- Do not pass raw history to the agent; use memory layer
- Make minimal changes and follow existing patterns
- Avoid new dependencies unless necessary
- Use strict types; avoid `any`

## Validation
- Run lint and format check after changes
- Ensure `bun run tauri dev` works
- Verify end-to-end flow if touching core logic

## Safety
- Never commit user data or secrets
- Do not hardcode local paths or personal data
