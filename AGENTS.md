# Repository Guidelines

## Project Structure & Module Organization

This is a Bun + Turborepo monorepo. Key locations:
- `apps/`: product surfaces (e.g., `apps/web`, `apps/desktop`, `apps/mobile`, `apps/worker`, `apps/extension`).
- `packages/`: shared libraries and platform adapters (e.g., `packages/domain`, `packages/api`, `packages/ui`, `packages/sdk`, `packages/adapters/*`, `packages/platform/*`).
- `docs/plans/`: design notes and technical plans referenced by the repo README.
- `docs/runbooks/`: practical setup/run guides (for example local experience walkthrough).

When adding new code, prefer colocating platform-specific logic under `apps/` and shared abstractions under `packages/`.

## Build, Test, and Development Commands

Run from repo root:
- `bun run dev`: starts Turbo dev tasks for all apps that define `dev`.
- `bun run build`: builds all workspaces via Turbo.
- `bun run typecheck`: runs TypeScript checks across workspaces.
- `bun run test`: runs Turbo tests across workspaces that define `test` (currently `@daemon/domain`, `@daemon/api`, `@daemon/web`, `@daemon/worker`, `@daemon/adapters-llm-vercel`).
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
- API router tests live in `packages/api/src/__tests__/`.
- Web route/server tests live in `apps/web/app/api/**` and `apps/web/src/**`.
- Worker tests live in `apps/worker/src/*.test.ts`.
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

## Current Project Status (2026-02-26)

- Plan baseline is now `docs/plans/2026-02-03-ai-longterm-assistant-design.md` (V2), including gateway-aligned architecture constraints.
- Root workspace baseline has been fixed:
  - `package.json` now includes `packageManager`.
  - Turbo workspace `typecheck` and `test` commands are expected to run from repo root.
  - Workspace package exports are declared for internal package resolution.
- Authentication trust chain has been hardened in web APIs:
  - Do not trust `x-user-id`.
  - Resolve user identity server-side from `x-access-token` (`apps/web/src/server/auth.ts`).
- Chat memory injection policy has been tightened:
  - Default context injection uses `public` memory only.
  - `private` memory is opt-in and `secret` memory is excluded from default injection.
  - chat context retrieval now supports explicit `scopeType/scopeId` filtering and web/API chat paths pin scope to current user.
  - `memory.create` now enforces `scopeType=user` and `scopeId===ctx.user.id` at API layer (`packages/api/src/router.ts`).
  - `apps/web/app/memory` now uses authenticated session user id for memory writes.
- Agent ownership checks are now enforced across all `agentId`-scoped APIs:
  - `usage.summary`, `transcript.list`, `memory.list`, `memory.create`, `chat.turn`, and `/api/chat/stream` perform `agent.getAgent(agentId, user.id)` before data/model access.
  - unauthorized agent access now returns `FORBIDDEN` (tRPC) or `403` (stream route), with route-level tests.
  - missing agent returns `NOT_FOUND` (tRPC) or `404` (stream route).
- Worker queue consumption has been upgraded to atomic claim:
  - Use `claim_next_jobs` SQL function (`packages/adapters/supabase/sql/schema.sql`).
  - Worker uses RPC claim flow (`apps/worker/src/claimJobs.ts`) with retry/backoff/dead-letter state transitions.
  - Retry delay now uses exponential backoff with cap (`JOB_RETRY_BASE_MS`, `JOB_RETRY_MAX_MS`) and dead-letters at `JOB_MAX_ATTEMPTS`.
  - Worker currently accepts only `COMPACTION` / `MEMORY_FLUSH` / `EMBEDDING_BACKFILL`; unknown types are treated as failures and follow the same retry/dead-letter path.
- UI foundation now uses shadcn-style primitives in `@daemon/ui`:
  - `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Dialog`, `DropdownMenu`.
  - `apps/web` now uses Tailwind CSS v4 (`apps/web/postcss.config.mjs`, `apps/web/app/globals.css`).
  - `apps/web` now has a unified dashboard shell (`apps/web/src/components/dashboard-shell.tsx`) with compact shared nav/user status and reduced visual noise.
  - core app pages (`/`, `/agents`, `/chat`, `/chat/[agentId]`, `/memory`, `/transcripts`, `/usage`) were visually redesigned for consistent layout hierarchy and clearer task flows.
  - `apps/web/app/memory` and `apps/web/app/transcripts` now include local filtering, pagination, loading skeleton, and empty states.
  - `apps/web/app/usage` is now available with day/month usage summary, token split, cost estimate, trend chart, and URL query-state sync.
  - `apps/web/app/usage`, `apps/web/app/memory`, and `apps/web/app/transcripts` now prioritize dropdown-based Agent/session selection (no manual copy-paste Agent ID flow).
  - navigation entry for Usage is now available on home page and per-agent quick links (`/usage?agent=...`) in `apps/web/app/agents`.
  - `apps/web/app/agents` now shows explicit list/create error messages and disables repeated auto-retries on failed list requests.
  - `apps/web/app/chat/[agentId]` now uses simplified chat-first layout with inline session selector + one-click new session creation (no manual sessionKey input).
  - `apps/web/app/chat` and authenticated `/` now use chat-entry gating: auto-open most recent agent chat, and auto-bootstrap `Default Agent` when user has none.
  - API now exposes `session.list` (recent sessions) and `usage.trend` (bucketed usage series: hourly for day, daily for month).
- Chat idempotency baseline is now wired:
  - `chatTurn/chatTurnStream` accept `idempotencyKey` and replay completed responses for duplicate keys.
  - duplicate in-flight key now returns conflict (`IdempotencyConflictError`) instead of re-running model calls.
  - `transcript_events` now carries `request_id` with dedupe index for `user_message/assistant_message`.
  - stream endpoint supports `x-idempotency-key` header (`apps/web/app/api/chat/stream/route.ts`).
- Usage cost estimation now supports model price mapping:
  - `chatTurn/chatTurnStream` compute `usage_events.cost_estimate` when model pricing is available.
  - pricing resolution supports env-driven mapping in `@daemon/api` (`packages/api/src/pricing.ts`).
  - supported env overrides: `MODEL_PRICING_JSON` or `OPENAI_INPUT_PRICE_PER_1M` + `OPENAI_OUTPUT_PRICE_PER_1M`.
- Token hard cap guardrails are now wired to usage ledger:
  - `chat.turn` enforces optional `CHAT_DAILY_TOKEN_HARD_CAP` / `CHAT_MONTHLY_TOKEN_HARD_CAP` before model execution.
  - `/api/chat/stream` enforces the same hard-cap check and returns `429` on projected overage.
  - cap projection uses `used(tokens_in+tokens_out) + incoming_user_tokens + reserve_output_tokens`.
- Single-turn max-input guardrail is now wired:
  - optional `CHAT_MAX_INPUT_TOKENS` rejects oversized user turns before model execution.
  - `chat.turn` returns `BAD_REQUEST`; `/api/chat/stream` returns `413`.
  - reject decisions append `audit_events(event_type=chat_input_too_large)`.
- Budget degradation baseline is now wired (pre-hard-cap fallback path):
  - optional `CHAT_BUDGET_DEGRADE_ENABLED=1` enables pre-reject budget downgrade in `chat.turn` and `/api/chat/stream`.
  - downgrade knobs: `CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS`, `CHAT_DEGRADE_MEMORY_TOPK`, `CHAT_DEGRADE_RECENT_MESSAGES`.
  - when downgrade is applied, decision metadata is written to `usage_events.meta` and `audit_events(event_type=chat_budget_degraded)`.
- Model fallback routing observability is now wired end-to-end:
  - LLM adapter reports resolved model selection (`primary` or `fallback`) per request.
  - chat usage ledger now persists `usage_events.meta.model_route_selected` and `usage_events.meta.model_used`.
  - route-level configured metadata (`model_route_strategy`, `model_route_primary`, `model_route_fallback`) remains recorded for debugging intended-vs-actual routing.
- Chat rate limiting baseline is now wired:
  - `chat.turn` and `/api/chat/stream` support optional per-user-per-agent `CHAT_QPS_LIMIT` / `CHAT_QPM_LIMIT`.
  - rate limiter now prefers DB-backed atomic counters via Supabase RPC `consume_chat_rate_limit` (cross-instance consistency).
  - if DB limiter is unavailable, it falls back to in-process memory buckets as a safety fallback.
  - DB-backed limiter schema lives in `public.chat_rate_limit_counters` (`packages/adapters/supabase/sql/schema.sql`).
- Token budgeting now supports replaceable estimators:
  - domain context/chat pipeline supports model-aware `countTokens` injection (`TokenizerPort`).
  - web container uses `js-tiktoken` for OpenAI model token counting with fallback to `o200k_base`.
  - if tokenizer resolution fails, it safely falls back to approx estimation.
- Structured logging baseline is in place:
  - web stream route logs JSON lines with `request_id/user_id/agent_id/session_id/route/latency_ms/tokens/model/error_code`.
  - tRPC context + `chat.turn` now emit structured logs with the same trace fields.
  - worker poll/job lifecycle logs are now structured JSON events (`apps/worker/src/logger.ts`, `apps/worker/src/index.ts`).
  - worker job failures now append `audit_events` (`event_type=job_failed`) for DB-side traceability.
  - tRPC adapter-level `onError` is enabled for unhandled procedure errors.
  - `x-request-id` is propagated/returned on chat stream and tRPC responses for log correlation.
- API route-level tests now include:
  - unauthorized rejection for protected procedures (`agent.list`).
  - Supabase infra error mapping checks for `agent.list`/`agent.create` (`42P01` schema missing, `42501` permission denied).
  - usage period window mapping assertions for `usage.summary` (`day`/`month`).
  - usage bucket mapping assertions for `usage.trend` (`day -> hour`, `month -> day`).
  - session list route assertion for `session.list`.
  - idempotency conflict mapping assertion for `chat.turn` (`TRPC CONFLICT`).
- Stream route test baseline is now in place:
  - `/api/chat/stream` tests cover unauthorized, idempotency conflict, startup failure, and successful SSE (`meta/chunk/done`) with `X-Request-Id`.
  - `/api/chat/stream` tests cover authenticated-but-forbidden agent access (`403`).
  - `/api/chat/stream` tests also cover `429` hard-cap rejection.
  - `/api/chat/stream` tests also cover `429` QPS rate-limit rejection.
  - `/api/chat/stream` tests also cover DB rate-limit store rejection path.
  - stream route exports `createPostHandler` to allow dependency-injected route testing without changing runtime behavior.
- `@daemon/web` now has a `test` script and participates in root `bun run test` via Turbo.
- `@daemon/worker` now has a `test` script and participates in root `bun run test` via Turbo.
- Local experience onboarding is documented:
  - `docs/runbooks/local-experience.md`
  - env templates: `apps/web/.env.local.example`, `apps/worker/.env.example`

## Current Implementation Notes

- When adding new UI to `apps/web`, prefer `@daemon/ui` components and utility classes over inline `style`.
- For stream/chat API requests, send only access token header (`x-access-token`), never a client-asserted user id header.
- For idempotent chat retries, provide the same `idempotencyKey` (or `x-idempotency-key`) when retrying the same user turn.
- To enable accurate usage cost accounting for your active model pricing:
  - set `MODEL_PRICING_JSON` (per-model mapping), or
  - set `OPENAI_INPUT_PRICE_PER_1M` and `OPENAI_OUTPUT_PRICE_PER_1M`.
- Tokenizer notes:
  - `apps/web` depends on `js-tiktoken` for model-aware token counting.
  - unknown model names will fall back to `o200k_base` tokenizer.
- LLM provider notes:
  - `@daemon/adapters-llm-vercel` supports OpenAI-compatible providers via `OPENAI_BASE_URL` + `OPENAI_API_KEY`.
  - for DeepSeek-only setups, set `LLM_COMPATIBILITY=compatible` and `OPENAI_MODEL=deepseek-chat`.
  - optional `OPENAI_FALLBACK_MODEL` enables primary->fallback retry inside LLM adapter for `streamChat/completeChat`.
  - chat usage metadata now includes both configured routing (`model_route_*`) and resolved execution (`model_route_selected`, `model_used`).
  - embedding supports `EMBEDDING_MODE=local` (deterministic local vector) when remote provider has no embedding endpoint.
- Optional alert webhooks:
  - web: `ALERT_WEBHOOK_URL` + optional `ALERT_MIN_LEVEL` (`info|warn|error`, default `error`).
  - worker: `WORKER_ALERT_WEBHOOK_URL` + optional `WORKER_ALERT_MIN_LEVEL` (falls back to global alert vars).
- Optional slow-request threshold:
  - `CHAT_LATENCY_ALERT_MS` (default `2500`) for `chat.turn` and `/api/chat/stream` slow-path warning logs.
- Optional worker retry/backoff envs:
  - `JOB_MAX_ATTEMPTS` (default `5`).
  - `JOB_RETRY_BASE_MS` (default `5000`).
  - `JOB_RETRY_MAX_MS` (default `300000`).
- Optional token hard cap envs:
  - `CHAT_DAILY_TOKEN_HARD_CAP` (integer, disabled when unset/invalid).
  - `CHAT_MONTHLY_TOKEN_HARD_CAP` (integer, disabled when unset/invalid).
- Optional single-turn input cap env:
  - `CHAT_MAX_INPUT_TOKENS` (integer, disabled when unset/invalid).
- Optional LLM provider envs:
  - `OPENAI_BASE_URL`, `LLM_PROVIDER_NAME`, `LLM_COMPATIBILITY`.
  - `EMBEDDING_MODE` (`remote|local`), `ALLOW_LOCAL_EMBEDDING_FALLBACK`, `LOCAL_EMBED_DIMENSIONS`.
- Agent bootstrap troubleshooting:
  - if `/api/trpc/agent.list` or create returns schema-related errors, run `packages/adapters/supabase/sql/schema.sql` then `packages/adapters/supabase/sql/rls.sql` in Supabase SQL Editor.
  - if errors mention permission denied (`42501`), re-check RLS policy application and confirm the current browser session is logged in.
  - server-side Supabase env now accepts fallback from `NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY` when `SUPABASE_URL/SUPABASE_ANON_KEY` are not set.
  - chat-entry auto-bootstrap uses `agent.create({ name: "Default Agent" })`; if this fails, verify schema/RLS first before UI debugging.
- Optional chat rate limit envs:
  - `CHAT_QPS_LIMIT` (integer, disabled when unset/invalid).
  - `CHAT_QPM_LIMIT` (integer, disabled when unset/invalid).
- Optional budget degrade envs:
  - `CHAT_BUDGET_DEGRADE_ENABLED` (`1|true|yes` to enable).
  - `CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS` (default clamps to `min(RESERVE_OUTPUT_TOKENS, 512)`).
  - `CHAT_DEGRADE_MEMORY_TOPK` (default clamps to `min(MEMORY_TOPK, 4)`).
  - `CHAT_DEGRADE_RECENT_MESSAGES` (default clamps to `min(RECENT_MESSAGES, 10)`).
- Audit coverage additions:
  - `chat.turn` and `/api/chat/stream` now append `audit_events` for `chat_rate_limited` and `chat_hard_cap_exceeded` (best-effort).
- Stability regression tests now include:
  - 200-turn single-session domain chat regression.
  - 20 concurrent domain chat turns across sessions.
- Staging/load test scripts are available:
  - `bun run loadtest:chat` (web SSE chat concurrency/perf summary, defaults to 50 concurrent).
  - `bun run loadtest:claim` (worker multi-instance claim consistency; requires explicit queue-impact confirm env).
- If you change worker job lifecycle behavior, update both:
  - DB claim function in `packages/adapters/supabase/sql/schema.sql`
  - worker claim/processing code in `apps/worker/src/*` (including `retry.ts` backoff policy and supported job-type gate)
- If you change chat rate-limiting behavior, update both:
  - DB limiter schema/RPC in `packages/adapters/supabase/sql/schema.sql`
  - api helper/router path in `packages/api/src/rateLimit.ts` and `packages/api/src/router.ts`
- If you change memory retrieval filters, update both:
  - `match_memory_items` SQL signature/filters in `packages/adapters/supabase/sql/schema.sql`
  - adapter + domain filter wiring in `packages/adapters/supabase/src/stores/memory.ts` and `packages/domain/src/usecases/*`
- Keep validating with:
  - `bun run typecheck`
  - `bun run test`
  - focused tests where applicable (for example `apps/web/src/server/auth.test.ts`, `apps/web/app/api/chat/stream/route.test.ts`, `apps/worker/src/claimJobs.test.ts`, `apps/worker/src/retry.test.ts`, `apps/web/src/features/historyFilters.test.ts`, `packages/api/src/__tests__/router.test.ts`)
- For manual product QA and demos, use:
  - `docs/runbooks/local-experience.md`
