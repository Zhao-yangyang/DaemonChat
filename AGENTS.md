# Repository Guidelines

## Project Structure & Module Organization

This is a Bun + Turborepo monorepo. Key locations:
- `apps/`: product surfaces (e.g., `apps/web`, `apps/desktop`, `apps/mobile`, `apps/worker`, `apps/extension`).
- `packages/`: shared libraries and platform adapters (e.g., `packages/domain`, `packages/api`, `packages/ui`, `packages/sdk`, `packages/adapters/*`, `packages/platform/*`).
- `docs/plans/`: design notes and technical plans referenced by the repo README.

When adding new code, prefer colocating platform-specific logic under `apps/` and shared abstractions under `packages/`.

## Build, Test, and Development Commands

Run from repo root:
- `bun run dev`: starts Turbo dev tasks for all apps that define `dev`.
- `bun run build`: builds all workspaces via Turbo.
- `bun run typecheck`: runs TypeScript checks across workspaces.
- `bun run test`: runs Turbo tests (currently used in `packages/domain`).
- `bun run lint`: runs Turbo lint tasks (many packages currently stub this).

Example scoped command:
- `bun run dev --filter @daemon/web`: run only the web app.

## Coding Style & Naming Conventions

- TypeScript is used across the repo with strict settings in `tsconfig.base.json`.
- Use ES module syntax (`import`/`export`) and keep changes consistent with existing files.
- Naming follows package scopes like `@daemon/<name>` and app names like `@daemon/web`.
- Tests use `.test.ts` and `.typecheck.ts` suffixes (see `packages/domain/src/__tests__/`).
- No formatter or lint rules are enforced yet; keep formatting consistent with nearby code.

## Testing Guidelines

- Primary tests live in `packages/domain/src/__tests__/`.
- Run all tests with `bun run test`, or package-only with `bun --cwd packages/domain test`.
- Prefer adding tests alongside domain logic when changing core behavior.

## Commit & Pull Request Guidelines

- Commit messages follow Conventional Commits (e.g., `feat(web): add streaming chat`).
- PRs should include a clear summary, scope, and linked issue if applicable.
- Include screenshots or recordings for UI changes in `apps/web` or `apps/*` frontends.
- Ensure `bun run typecheck` and relevant tests pass before requesting review.

## Security & Configuration Tips

- Avoid committing secrets. If environment variables are required, document them in the relevant app README.
- Keep adapter-specific credentials isolated to their respective packages (e.g., `packages/adapters/*`).
