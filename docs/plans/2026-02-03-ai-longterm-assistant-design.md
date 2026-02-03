# AI 长期助手 SaaS 平台开发 Plan（Monorepo + DI）

> 来源：用户提供的整体规划，作为当前项目的设计基线。

## 0. 目标与边界

### MVP 目标（必须做到）

- 单用户/多用户均可用：每个用户拥有自己的 Agent（长期存在）
- 同一个 Agent 可持续对话：支持 transcript、compaction、memory（向量检索 TopK 注入）
- 成本可控：context budget、token usage 记录、基础限流
- Web 可用：Next.js + tRPC + streaming chat UI（最小控制面板）
- 预留多端壳（Tauri/WXT/Expo）：先只搭壳，不做完整功能

### MVP 不做（明确推迟）

- 多 agent 协作编排（后续）
- 企业级 SSO、全量审计导出（后续）
- Marketplace（后续）
- 复杂工作流/自动化（后续）

## 1) Monorepo 结构（推荐定稿）

```
apps/
  web/                  # Next.js 16 + React 19 + tRPC host + UI
  worker/               # Bun worker：后台 jobs/cron/queue consumers
  desktop/              # Tauri 壳（先空壳）
  extension/            # WXT 壳（先空壳）
  mobile/               # Expo 壳（先空壳）

packages/
  domain/               # 纯业务内核（无 Next/无 tRPC/无 Vercel 依赖）
  adapters/
    supabase/           # Postgres/Vector/Storage 实现
    llm-vercel/         # Vercel AI SDK 6.0 适配器
    queue/              # cron/queue 适配器（先实现最小：定时/任务表轮询）
  api/                  # tRPC routers + context + input schemas
  ui/                   # Tailwind 4 + shadcn/ui 组件
  hooks/                # useAgent/useMemory/useTranscript/useUsage
  sdk/                  # tRPC client helpers（多端复用）
  platform/
    capabilities/       # 原生能力接口定义（file/tray/clipboard 等）
    web/                # web 实现
    tauri/              # tauri 实现（stub）
    expo/               # expo 实现（stub）
    wxt/                # extension 实现（stub）
```

## 2) 依赖注入（DI）方案（最小但够用）

### DI 规则

- `packages/domain` 只定义 **Ports 接口**（DB/LLM/Storage/Clock/Queue）
- `packages/adapters/*` 提供 Ports 的具体实现
- `apps/web` 的 tRPC `createContext()` 创建 request-scope container
- `apps/worker` 创建 job-scope container

### 交付物

- `packages/domain/src/container/types.ts`（Ports & Services 类型）
- `packages/domain/src/container/createServices.ts`（usecase 构造器，注入 ports）
- `apps/web/src/server/container.ts`（createContainer(env)）
- `apps/worker/src/container.ts`（createWorkerContainer(env)）

## 3) 数据库与存储（Supabase：Postgres + Vector + Storage）

### 3.1 表结构（MVP 必需）

#### agents

- `id (uuid pk)`
- `owner_user_id (uuid)`
- `name`
- `created_at`
- `updated_at`

#### sessions

- `id (uuid pk)`  // sessionId
- `agent_id (uuid)`
- `session_key (text)` // “main” / groupId / channelId
- `current (bool)` 或直接用 `session_key -> current_session_id` 的索引表
- `created_at`
- `last_active_at`

#### transcript_events（append-only）

- `id (uuid pk)`
- `agent_id`
- `session_id`
- `type (text)` // user_message/assistant_message/tool_call/compaction/memory_flush/system
- `content (jsonb)` // 事件载荷
- `tokens_in (int)`
- `tokens_out (int)`
- `created_at`
- 索引：`(agent_id, session_id, created_at)`

#### memory_items（结构化记忆 + 向量）

- `id (uuid pk)`
- `agent_id`
- `scope_type (text)` // user/team/org（先 user）
- `scope_id (uuid)`   // 先=owner_user_id
- `type (text)` // fact/rule/preference/task
- `content (text)`
- `tags (text[])`
- `sensitivity (text)` // public/private/secret
- `context_eligible (bool)`
- `embedding (vector)` // Supabase Vector
- `created_at`
- `updated_at`
- 索引：`(agent_id, created_at)` + vector index（按 Supabase 建议）

#### usage_events（计费/限流）

- `id`
- `agent_id`
- `event_type` // llm/tool/storage
- `tokens_in`
- `tokens_out`
- `cost_estimate`
- `meta (jsonb)`
- `created_at`

#### audit_events（MVP 先简化）

- `id`
- `tenant_id(optional)`
- `agent_id`
- `event_type`
- `payload (jsonb)`
- `created_at`

### 3.2 RLS（Supabase 行级权限）

- agents：owner 才能读写
- sessions/transcript/memory：通过 agent_id join agents.owner_user_id 验证
- usage/audit：同上

### 3.3 Storage（可选，MVP 可先不用）

- 后续把 transcript 冷数据归档到 Supabase Storage / R2

## 4) Domain Usecases（核心业务用例清单）

> 这些用例全部放 `packages/domain`，不出现 Next/tRPC/Vercel 细节。

### 4.1 Agent

- `createAgent(ownerUserId, name)`
- `getAgent(agentId, ownerUserId)`
- `listAgents(ownerUserId)`

### 4.2 Session

- `resolveSession(agentId, sessionKey)`
  - 找到 current sessionId；必要时新建
  - 更新 last_active_at

### 4.3 Transcript（事件流）

- `appendEvent(agentId, sessionId, event)`
- `loadRecentContext(agentId, sessionId, limit)`
- `loadLatestCompaction(agentId, sessionId)`（可选：直接从 events 中取最新 compaction）

### 4.4 Memory（RAG）

- `writeMemoryItem(agentId, item)`（带 sensitivity/contextEligible）
- `retrieveTopMemory(agentId, query, topK, filters)`（向量检索）
- `maybeMemoryFlush(agentId, sessionId, contextStats)`（压缩前写记忆：MVP 可简化为“遇到阈值就抽取要点写 memory_items”）

### 4.5 Chat Turn（最核心）

- `chatTurn(agentId, sessionKey, userInput, options)`
  - resolveSession
  - append user_message event
  - buildContextPack（见下一节）
  - LLM stream/complete
  - append assistant_message event
  - record usage_event
  - compactIfNeeded（同步/或投递 job）

### 4.6 Compaction

- `compactIfNeeded(agentId, sessionId, stats)`
  - 如果 tokens 接近 window → 生成 summary（compaction event）
  - 只保留最近 N 轮原文，旧对话靠 summary 替代（逻辑上通过 buildContextPack 控制加载）

## 5) Context Pack 规范（决定“不切窗口也准”）

每一轮送进模型的上下文必须严格由 Context Builder 生成：

### ContextPack（按优先级）

1. `system`：产品系统指令（固定）
2. `constraints`：硬规则（用户明确要求/格式/禁忌）（MVP 可先作为 memory rule）
3. `task_state`：结构化任务状态（MVP 可先不做复杂，只保留当前会话摘要字段）
4. `memory_topK`：向量检索出来的记忆条目（过滤 sensitivity/context_eligible）
5. `recent_messages`：最近 N 条 transcript 原文
6. `user_input`：本轮问题

### Token 预算规则（MVP 必须）

- `max_context_tokens = modelWindow - reserveOutput - reserveTools`
- 超预算时：减少 recent_messages 数量、减少 memory_topK、必要时触发 compaction

## 6) API 层（tRPC v11）规划

`packages/api` 输出 router，`apps/web` 作为 host。

### 必需 routes

- `agent.create`
- `agent.list`
- `agent.get`
- `chat.turn`（支持 streaming）
- `memory.list`（控制面板显示）
- `memory.create`（手动保存记忆）
- `transcript.list`（按 session 拉取）
- `usage.summary`（本月/今日 token）

### tRPC Context

- `user`（来自 Supabase Auth）
- `container`（DI 注入的 services）

## 7) Web App（Next.js 16）交付范围

### 页面（MVP）

1. 登录/注册（Supabase Auth UI 或自做）
2. Agent 列表页（创建/选择）
3. Chat 页（streaming UI + 侧边栏：记忆/用量）
4. Memory 管理页（查看/新增/标记 contextEligible/sensitivity）
5. Transcript 查看页（debug 用）

### UI 包

- `packages/ui`：shadcn + Tailwind 4
- `packages/hooks`：封装 tRPC 调用

## 8) Worker（Bun）后台任务（MVP 版本）

> 先做最小，但把接口打通，为后续扩展铺路。

### Job 类型

- `COMPACTION`：异步 compaction（可选，MVP 可先同步在 chatTurn 里）
- `MEMORY_FLUSH`：抽取长期记忆（MVP 可先简化）
- `EMBEDDING_BACKFILL`：记忆入库后补 embedding（若 embedding 异步）

### 实现方式（两种选一，MVP 推荐表轮询）

- 方案A：Supabase `jobs` 表 + worker 轮询（最简单）
- 方案B：Vercel Cron 触发 Next route 推 job（可用但不优雅）

## 9) 多端壳策略（先建骨架）

### 共识

- Web 是“逻辑供应站”
- Desktop/Extension/Mobile 先只做：
  - 登录
  - 选择 agent
  - 打开 chat（用同一套 `packages/ui + packages/sdk/hooks`）

### 平台能力注入（先 stub）

`packages/platform/capabilities` 定义接口：

- `clipboard`
- `filesystem`
- `tray`
- `notifications`

各平台实现先返回 `notSupported`，后续再补齐。

## 10) 里程碑与验收标准（完成定义）

### Milestone A（能跑内核）

- [ ] createAgent / resolveSession / appendEvent
- [ ] memory_items 写入 + embedding + topK 检索
- [ ] chatTurn：能流式回复
- [ ] transcript_events 持久化可回放
- [ ] buildContextPack 严格按预算裁剪
- 验收：同一 agent 连续聊 200+ 轮，不需要新会话仍能记住关键点（通过 memory_topK 注入）

### Milestone B（可用产品）

- [ ] Web 登录
- [ ] Agent 管理
- [ ] Chat UI streaming
- [ ] Memory 面板（可查看/手动保存/设置 contextEligible）
- [ ] Usage 面板（token 统计）
- 验收：用户可注册→创建 agent→持续对话→看到记忆与用量

### Milestone C（成本安全）

- [ ] 超预算降级策略（先限制输出长度）
- [ ] 超 context 自动 compaction
- [ ] tool call quota 框架（即使 MVP 工具少也要有）
- 验收：恶意长输入/超长对话不会导致请求失败或成本失控

## 11) 推荐工作方式（开发指令）

- 创建一个 Bun monorepo，按 Plan 的目录结构生成项目骨架。
- 实现 packages/domain 的 usecases（Agent/Session/Transcript/Memory/Compaction/ChatTurn）。
- domain 必须只依赖 typescript 标准库，不允许引用 next、trpc、vercel ai sdk。
- adapters/supabase 实现 domain ports：db、vector search、storage、auth lookup（从 tRPC context 获取 user）。
- adapters/llm-vercel 实现 LLM ports：stream、complete、embed（使用 Vercel AI SDK）。
- packages/api 提供 tRPC routers，并在 apps/web host。
- apps/web 提供最小 UI：登录、agent 列表、chat、memory、usage。
- transcript_events 必须 append-only。
- context builder 必须实现 token budget、TopK memory 注入、recent messages 裁剪与 compaction 触发。
- 所有关键路径写单元测试（domain）与最小集成测试（api）。

## 12) 开发顺序（强烈建议照这个写，最快不返工）

1. Monorepo skeleton + TS 配置
2. Domain ports & entity models
3. Supabase schema + RLS
4. transcript_events append & query
5. memory_items 写入 + embedding + topK 检索
6. Context Builder + token budget
7. ChatTurn（streaming）+ usage_events
8. Compaction event 写入 + 读取 compaction
9. tRPC routers 接起来
10. Web UI（最小可用）
11. Worker（jobs 表轮询）（可选）
