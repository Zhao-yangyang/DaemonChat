# AI 长期助手 SaaS 平台开发总计划（V2）

> 状态：可执行基线（用于后续落地与验收）
>
> 更新时间：2026-02-26
>
> 目标：在你原始思路不变的前提下，补全安全、并发、成本、可观测、测试与发布闭环，避免“能跑但不可控”。

---

## 0. 计划定位

这不是“灵感草稿”，而是后续开发与验收的执行规范。

执行要求：

- 每个里程碑必须有入口条件、出口条件、验收证据。
- 所有“可能会做”的项必须改为“本期做/不做/延期到哪一期”。
- 所有关键风险必须有明确兜底策略。

---

## 1. 产品目标与边界

### 1.1 MVP 必须达成

- 每个用户可创建并长期持有自己的 Agent。
- 同一 Agent 支持长期连续对话（session + transcript + memory + compaction）。
- 支持流式回复（Web chat streaming）。
- 具备基础成本控制（token 预算、usage 统计、限额/限流）。
- 具备最低安全隔离（用户级授权、RLS、敏感记忆过滤、审计事件）。

### 1.2 MVP 明确不做

- 多 Agent 协作编排。
- 企业 SSO、细粒度 RBAC、组织级审计导出。
- Marketplace。
- 复杂自动化工作流编排器。

### 1.3 成功标准（业务）

- 连续 200+ 轮对话不崩溃，不强制切新会话。
- 关键用户偏好可被稳定回忆（可通过 memory_topK 证据验证）。
- 单用户成本可预测（可看到日/月 token 与成本估算）。
- 异常输入不会导致系统失控（超长输入、重复请求、并发请求）。

---

## 2. 架构原则（必须遵守）

- Domain Pure：`packages/domain` 不依赖 Next/tRPC/Vercel/Supabase SDK。
- Append-only First：`transcript_events` 仅追加，不原地改写历史。
- Deterministic Context：每轮上下文只能由 Context Builder 按规则组装。
- Security by Default：不信任前端传入用户标识，服务端必须验证 token。
- Cost Guardrails：任何模型调用前都经过预算裁剪与限额判断。
- Idempotent by Design：关键写操作支持幂等键或去重策略。

### 2.1 Gateway 对齐原则（openclaw 灵感来源）

本项目把 openclaw gateway 的核心思想收敛为 6 条工程约束，作为后续评审标准：

1. `Provider Abstraction`

- 统一模型接入接口（chat stream/complete/embed），业务层不可依赖厂商 SDK 细节。
- 新增或替换模型提供商时，不改 domain usecase。

2. `Policy Pipeline`

- 每个请求在进入模型前后都经过策略链：鉴权、配额、敏感过滤、审计。
- 策略链必须可观测（记录命中策略与拒绝原因）。

3. `Routing & Fallback`

- 保留模型路由与降级能力：主模型失败时可切备用模型或短答模式。
- 路由/降级决策写入 `usage_events.meta`，用于复盘。

4. `Idempotency`

- Chat 请求支持幂等键（或等价去重键），防重试导致重复写 transcript 或重复计费。
- 幂等冲突返回已存在结果或明确错误码。

5. `Usage Ledger`

- token、请求数、成本估算统一记账，且以 agent/user 维度可追踪。
- 限流、hard cap、预算降级都基于同一账本执行。

6. `Traceability`

- 每轮请求必须可追踪 `request_id/user_id/agent_id/session_id/prompt_version`。
- 关键路径异常（鉴权失败、预算超限、模型失败、job 失败）可从日志与审计反查。

### 2.2 设计落地映射（MVP）

- `Provider Abstraction`：`packages/domain` + `packages/adapters/llm-vercel` ports 约束。
- `Policy Pipeline`：`apps/web` API 层 + `packages/api` 输入/权限/预算校验。
- `Routing & Fallback`：`chatTurn/chatTurnStream` 的模型选择与降级钩子。
- `Idempotency`：`chat_requests` 或 `transcript_events.request_id` 去重方案。
- `Usage Ledger`：`usage_events` + `usage.summary` + 限额策略。
- `Traceability`：结构化日志字段 + `audit_events` 关键事件。

---

## 3. Monorepo 结构（定稿）

```txt
apps/
  web/                  # Next.js 16 + React 19 + tRPC host + streaming route
  worker/               # Bun worker：jobs 轮询与执行
  desktop/              # Tauri shell（MVP 空壳）
  extension/            # WXT shell（MVP 空壳）
  mobile/               # Expo shell（MVP 空壳）

packages/
  domain/               # 纯业务内核（ports + usecases）
  adapters/
    supabase/           # Postgres/Vector/Storage adapter
    llm-vercel/         # LLM adapter（stream/complete/embed）
    queue/              # job queue adapter
  api/                  # tRPC routers/context/schema
  ui/                   # 共享 UI 组件
  hooks/                # tRPC hooks
  sdk/                  # 多端 API client
  platform/
    capabilities/       # clipboard/filesystem/tray/notifications 接口
    web/
    tauri/
    expo/
    wxt/
```

规则：

- 业务逻辑只在 `domain`。
- API 只做鉴权、输入校验、调用 domain。
- adapter 负责外部系统细节与错误翻译。

---

## 4. 运行时与请求流

### 4.1 Chat 请求流（同步流式）

1. API 接收请求并验证 access token。
2. 解析 user identity（服务端可信来源）。
3. `chatTurnStream()`：
   - `resolveSession`
   - 追加 `user_message`
   - 检索 `memory_topK`（含 sensitivity/contextEligible 过滤）
   - 载入 recent transcript
   - `buildContextPack` 按 token budget 裁剪
   - 调 LLM 流式输出
   - 追加 `assistant_message`
   - 写 `usage_events`
   - `compactIfNeeded`（同步或投递 job）
4. 返回 SSE chunk + done/error 事件。

### 4.2 Worker job 流（异步）

1. 原子 claim N 个 job（单 SQL，避免重复消费）。
2. 标记 processing 并记录 attempt。
3. 执行业务。
4. 成功标记 completed；失败进入 retry/backoff 或 dead-letter。

---

## 5. 数据模型（Supabase/Postgres）

## 5.1 必需表

- `agents`
- `sessions`
- `transcript_events`（append-only）
- `memory_items`（vector）
- `usage_events`
- `audit_events`
- `jobs`

## 5.2 约束与索引要求（新增补充）

- `sessions`：`(agent_id, session_key)` 对当前会话唯一。
- `transcript_events`：索引 `(agent_id, session_id, created_at)`。
- `memory_items`：
  - `context_eligible` 默认 true。
  - `sensitivity` 限定值：`public|private|secret`。
  - `type` 限定值：`fact|rule|preference|task`。
  - vector 索引按 embedding 维度一致。
- `jobs`：索引 `(status, run_at)`。
- `usage_events`：索引 `(agent_id, created_at)`。

## 5.3 append-only 的数据库级保障

- 对 `transcript_events` 禁止 update/delete（仅 insert/select policy）。
- 审计事件可追加，不允许修改历史 payload。

## 5.4 幂等与去重（新增）

新增一项（MVP 可选其一）：

- 方案 A：`chat_requests` 表记录 `idempotency_key` + 状态。
- 方案 B：`transcript_events` 增加 `request_id` 并建立去重唯一索引。

---

## 6. 安全与权限模型（必须补齐）

## 6.1 身份可信链

- 不信任 `x-user-id`。
- 服务端必须基于 `x-access-token` 解析并校验用户身份。
- `ctx.user` 仅来自服务端验证结果。

## 6.2 授权

- API 层先做“用户已登录”验证。
- domain 层关键读写做 owner 校验（防越权调用）。
- DB 层 RLS 做最后一道隔离（agent owner 才能访问相关数据）。

## 6.3 记忆敏感性策略

- `secret`：默认不进入上下文。
- `private`：仅在明确允许时进入上下文。
- `public`：可参与 topK。

## 6.4 审计要求

- 记录关键事件：登录失败、权限拒绝、敏感写入、模型调用、job 失败。
- 审计事件要求具备 `event_type`, `agent_id`, `payload`, `created_at`。

---

## 7. Domain 设计（Ports + Usecases）

## 7.1 Ports

- `AgentStore`
- `SessionStore`
- `TranscriptStore`
- `MemoryStore`
- `UsageStore`
- `AuditStore`
- `JobQueue`
- `LlmPort`
- `Clock`

## 7.2 Usecases（MVP）

- Agent：`createAgent/getAgent/listAgents`
- Session：`resolveSession`
- Transcript：`appendEvent/loadRecentContext/loadLatestCompaction`
- Memory：`writeMemoryItem/retrieveTopMemory/listMemoryItems`
- Chat：`chatTurn/chatTurnStream`
- Compaction：`compactIfNeeded`

## 7.3 错误模型（新增）

统一 domain error code：

- `UNAUTHORIZED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `RATE_LIMITED`
- `BUDGET_EXCEEDED`
- `UPSTREAM_ERROR`

API 层负责映射到 HTTP/tRPC 错误。

---

## 8. Context Pack 规范（升级版）

## 8.1 优先级

1. `system`
2. `constraints`
3. `task_state`
4. `memory_topK`（带 sensitivity/contextEligible 过滤）
5. `recent_messages`
6. `user_input`

## 8.2 Token 预算规则

- `max_context_tokens = modelWindow - reserveOutput - reserveTools`
- 超预算裁剪顺序：
  1. 减 recent messages
  2. 减 memory_topK
  3. 触发 compaction
  4. 仍超预算则返回 `BUDGET_EXCEEDED` 或强制短答模式

## 8.3 估算策略（新增）

- MVP 可用近似估算（字符/4），但必须支持可替换 tokenizer。
- 生产建议引入模型对应 tokenizer 进行精确估算。

## 8.4 Prompt 与策略版本化（新增）

- `prompt_version`、`context_policy_version` 写入 `usage_events.meta`。
- 便于回归分析和 A/B 对照。

---

## 9. API 层（tRPC + Streaming）

## 9.1 必需 routes

- `agent.create`
- `agent.list`
- `agent.get`
- `chat.turn`（同步）
- `memory.list`
- `memory.create`
- `transcript.list`
- `usage.summary`

## 9.2 Streaming 方案

- 继续保留 `POST /api/chat/stream`（SSE）作为流式主入口。
- 若后续 tRPC 官方流式方案成熟，再统一收敛。

## 9.3 输入校验要求

- 所有 `agentId/sessionId/scopeId` 必须校验格式与归属。
- `memory.create.scopeId` 在 MVP 中默认强制等于 `ctx.user.id`（scope=user）。

---

## 10. Worker 与任务系统

## 10.1 Job 类型

- `COMPACTION`
- `MEMORY_FLUSH`
- `EMBEDDING_BACKFILL`

## 10.2 原子 claim（必须）

当前“先 select 再 update”会导致并发重复消费，必须改为原子方案：

- 方案 A：SQL function + `for update skip locked`。
- 方案 B：`update ... where id in (subquery) returning *`。

## 10.3 重试策略（新增）

- `attempts` 超阈值后进入 `dead` 状态。
- 指数退避：`run_at = now + backoff`。
- 失败必须写 `audit_events`。

---

## 11. 成本与限流（MVP 必须闭环）

## 11.1 指标

- token in/out（按 agent/day/month）
- 成本估算（按模型单价映射）
- 请求数、错误率、超预算次数

## 11.2 限制策略

- 用户级 QPS/QPM 限流。
- 单轮最大输入 tokens。
- 单日/单月 token hard cap。
- 超限返回明确错误码，并记录审计。

## 11.3 降级策略

- 优先缩短输出上限。
- 减 memory_topK。
- 仅保留近期消息。
- 必要时禁用高级特性（如工具调用）。

---

## 12. 可观测性与运维

## 12.1 结构化日志

统一字段：

- `request_id`
- `user_id`
- `agent_id`
- `session_id`
- `route`
- `latency_ms`
- `tokens_in/out`
- `model`
- `error_code`

## 12.2 指标与告警

- `chat_turn_latency_p95`
- `chat_turn_error_rate`
- `job_failure_rate`
- `token_spend_daily`
- `compaction_trigger_rate`

## 12.3 SLO（MVP 目标）

- Chat 可用性：99.5%
- p95 首 token 延迟：< 2.5s（按环境可调）
- Worker job 处理成功率：> 99%

---

## 13. 测试策略（必须覆盖关键路径）

## 13.1 Domain 单测

- Agent/Session/Transcript/Memory/Chat/Compaction 全覆盖。
- 覆盖越权、预算超限、空输入、长输入、流式中断。

## 13.2 Adapter 集成测试

- Supabase adapter：CRUD、RLS、RPC vector 检索。
- LLM adapter：stream/complete/embed 错误映射。

## 13.3 API 集成测试

- 鉴权成功/失败。
- agent 归属校验。
- memory sensitivity 过滤。
- stream route 正常结束与异常中断。

## 13.4 回归与压测（新增）

- 200 轮长会话回归。
- 并发 20/50 请求下稳定性。
- worker 多实例并发消费一致性。

现状（2026-02-26）：

- `packages/api` 已补充路由级测试：`agent.list` 未登录拦截、`usage.summary` day/month 窗口映射、`chat.turn` 幂等冲突映射。
- API/stream 鉴权已改为服务端 access token 解析（不再信任 `x-user-id`）。
- `chat.turn` 与 `/api/chat/stream` 已补充 agent 归属校验，越权访问返回 `FORBIDDEN/403`（已补测试）。
- `chat.turn` 与 `/api/chat/stream` 已接入可配置 token hard cap（`CHAT_DAILY_TOKEN_HARD_CAP` / `CHAT_MONTHLY_TOKEN_HARD_CAP`），超限前置拒绝。
- `chat.turn` 与 `/api/chat/stream` 已接入可配置 QPS/QPM 限流（`CHAT_QPS_LIMIT` / `CHAT_QPM_LIMIT`），优先使用 DB 原子计数（RPC）并保留进程内兜底。
- `apps/web` 已补充 `/api/chat/stream` 测试：鉴权失败、幂等冲突、启动失败、SSE 正常输出与 `X-Request-Id` 回传。
- chat 上下文 memory 注入已默认 `sensitivity=public`，并新增 `scopeType/scopeId` 过滤以限制到当前用户作用域。
- `chat.turn` 与 `/api/chat/stream` 在 `rate_limit` / `hard_cap` 拒绝路径已补充 `audit_events` 写入（best-effort）。
- `packages/domain` 已加入 200 轮长会话与并发 20 路 chat 回归测试。
- worker retry/backoff 已调整为指数退避 + 上限封顶（`JOB_RETRY_BASE_MS` / `JOB_RETRY_MAX_MS` / `JOB_MAX_ATTEMPTS`），并补充 worker 单测。
- 50 并发与 worker 多实例一致性仍建议在 staging 环境做压测脚本验证。
- 已提供 staging 压测脚本入口：
  - `bun run loadtest:chat`（SSE chat 并发/延迟/错误率汇总）
  - `bun run loadtest:claim`（queue claim 一致性检查，含安全确认门）

---

## 14. 发布与迁移

## 14.1 环境分层

- `dev`
- `staging`
- `prod`

## 14.2 数据迁移

- SQL 脚本必须可重复执行（idempotent migration）。
- 每次变更写迁移说明与回滚策略。

## 14.3 配置管理

必需环境变量：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（worker）
- `OPENAI_MODEL`
- `OPENAI_EMBED_MODEL`
- `MODEL_CONTEXT_WINDOW`
- `RESERVE_OUTPUT_TOKENS`
- `RESERVE_TOOL_TOKENS`
- `MEMORY_TOPK`
- `RECENT_MESSAGES`

---

## 15. 多端壳策略

- Web 是主逻辑承载端。
- Desktop/Extension/Mobile 在 MVP 只做：登录、Agent 选择、打开 Chat。
- `platform/capabilities` 先 stub 返回 `notSupported`，并统一错误语义。

---

## 16. 里程碑与 DoD（Definition of Done）

## Milestone A：内核稳定可跑

入口条件：monorepo 可安装并可运行基础测试。

完成项：

- Agent/Session/Transcript/Memory/Chat/Compaction domain 完成。
- memory vector topK 可用。
- Context Builder 预算裁剪可用。
- transcript append-only 可验证。

出口证据：

- `packages/domain` 测试全绿。
- 200 轮长会话回归通过。

## Milestone B：Web 可用产品

入口条件：A 完成。

完成项：

- 登录、Agent 管理、Chat streaming、Memory 面板、Usage 面板。
- tRPC + SSE API 闭环。
- 基础审计与错误提示。

现状（2026-02-26）：

- Usage 面板已落地（`/usage`），支持 `agent` + `period(day|month)` 查询参数、token/cost 汇总与占比展示。
- 首页与 Agent 列表已增加 Usage 入口（含按 agent 预填跳转）。
- `memory.create` 已强制 `scopeType=user` 且 `scopeId===ctx.user.id`，前端 memory 页写入参数已对齐。

出口证据：

- 新用户注册到连续对话全链路演示通过。
- API 集成测试通过。

## Milestone C：成本与安全闭环

入口条件：B 完成。

完成项：

- 限流、hard cap、超预算降级。
- sensitivity 过滤与越权回归测试。
- worker 原子 claim + retry/backoff + dead-letter。

出口证据：

- 压测 + 恶意输入回归通过。
- 成本与错误指标可观测。

---

## 17. 当前仓库差距清单（落地前先修）

P0（必须先修）：

- 根 `package.json` 缺少 `packageManager`，Turbo 无法运行（已完成 2026-02-26）。
- `apps/web/package.json` JSON 语法错误（多余 `}`）（已完成 2026-02-26）。
- 多个 `apps/*/tsconfig.json` 的 `extends` 指向错误（已完成 2026-02-26）。
- API/stream 鉴权目前信任 `x-user-id`，需改为服务端 token 验证（已完成 2026-02-26）。
- memory 注入未显式按 `sensitivity` 过滤（已完成 2026-02-26）。
- worker job claim 非原子，存在重复消费风险（已完成 2026-02-26）。

P1（尽快补齐）：

- tokenizer 精确预算（已完成 2026-02-26：domain 支持可替换 tokenizer，web 已接入 `js-tiktoken`）。
- 幂等键支持（已完成 2026-02-26：`chatTurn/chatTurnStream` + `transcript_events.request_id` 去重索引）。
- usage cost*estimate 真实单价映射（已完成 2026-02-26：支持 `MODEL_PRICING_JSON`/`OPENAI*\*\_PRICE_PER_1M`）。
- 结构化日志与关键告警（部分完成 2026-02-26：web stream + tRPC chat.turn + worker 结构化日志，支持 webhook 告警钩子；仍缺指标系统级告警平台接入）。
- 用户级限流（QPS/QPM）已完成 DB 原子计数基线；后续可按流量规模迁移到专用 Redis 限流。
- 需确保部署迁移包含以下 SQL 变更：
  - `chat_rate_limit_counters` + `consume_chat_rate_limit`
  - `claim_next_jobs`
  - `match_memory_items` 的 `filter_scope_type/filter_scope_id` 参数升级

---

## 18. 实施顺序（避免返工）

1. 修复工程基线（Turbo + package.json + tsconfig）。
2. 修复鉴权可信链（服务端解析 token，移除对 `x-user-id` 的信任）。
3. 修复 memory sensitivity 过滤策略。
4. 修复 worker 原子 claim + retry/backoff。
5. 完成 API 集成测试（鉴权/越权/stream/预算）。
6. 完成 Web 页面闭环与可观测埋点。
7. 进行 200 轮与并发压测。
8. 上 staging 验证后再进 prod。

---

## 19. 一句话结论

你的想法本身方向正确，且架构骨架已经对；本 V2 计划的核心价值是把“可做”升级为“可持续交付并可控地做”。
