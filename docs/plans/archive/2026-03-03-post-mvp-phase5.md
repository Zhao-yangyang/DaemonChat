# Post-MVP Phase 5 实施计划

> 状态：待审核
>
> 更新时间：2026-03-03
>
> 前置：Post-MVP Phase 1（体验升级）/ Phase 3（Chat 交互增强）/ Phase 4（平台扩展）均已完成。

---

## Phase 1 "后续（本期不做）" 追溯

| 项目             | 状态              | 去向                                        |
| ---------------- | ----------------- | ------------------------------------------- |
| Agent 删除       | ✅ Phase 3 已完成 | `agent.delete` tRPC                         |
| 会话重命名/删除  | ✅ Phase 3 已完成 | `session.rename`/`session.delete` tRPC      |
| 会话归档         | ❌ 未完成         | 本期 Task 11                                |
| Memory 自动提取  | ✅ 已完成         | `memoryExtraction.ts` + Worker MEMORY_FLUSH |
| 多模型前端选择器 | ❌ 未完成         | 本期 Task 10                                |
| 对话导出         | ✅ Phase 4 已完成 | `export.session` tRPC (markdown/json)       |
| Staging 部署流程 | ❌ 未完成         | 本期 Task 12                                |

---

## 目标

修复已知代码缺口，完善核心差异化能力（记忆系统），强化 Workspace 隔离，补齐历史遗留项，为生产可用做最后冲刺。

## 优先级排序原则

1. **先修再建** — 已声明但空跑的功能优先补齐
2. **核心差异化** — 记忆自动提取的触发频率直接影响产品价值
3. **多租户基础** — Workspace 隔离是平台商业化的前提

---

## 特性一：补全 Worker Job 处理逻辑

> **问题**：`COMPACTION` 和 `EMBEDDING_BACKFILL` 在 `SUPPORTED_JOB_TYPES` 中但 `processJob` 无处理分支，空跑直接标 completed。

### Task 1: 实现 COMPACTION job 处理

**Files:**

- Modify: `apps/worker/src/runOnce.ts`
- Modify: `apps/worker/src/container.ts`

**Step 1: 在 `runOnce.ts` 的 `processJob` 中添加 COMPACTION 分支**

读取 job payload 中的 `agentId` / `sessionId`，调用 domain `compaction.compactIfNeeded` 执行对话压缩。

COMPACTION job payload 格式：

```json
{ "agentId": "<uuid>", "sessionId": "<uuid>" }
```

**Step 2: 在 `container.ts` 中暴露 compaction service 供 worker 使用**

Worker container 需要实例化 domain container 中的 `compaction` service，并通过 deps 传入 `runOnce`。

**Step 3: 验证**

```bash
bun --cwd apps/worker test
bun run typecheck
```

---

### Task 2: 实现 EMBEDDING_BACKFILL job 处理

**Files:**

- Modify: `apps/worker/src/runOnce.ts`

**Step 1: 在 `processJob` 中添加 EMBEDDING_BACKFILL 分支**

读取 payload 中 `agentId`，查询该 Agent 下 `embedding IS NULL` 的 memory items，批量计算 embedding 并回填。

EMBEDDING_BACKFILL job payload 格式：

```json
{ "agentId": "<uuid>", "batchSize": 50 }
```

**Step 2: 在 MemoryStore port 中添加 `listItemsWithoutEmbedding` 方法（如不存在）**

**Step 3: 验证**

```bash
bun --cwd apps/worker test
bun run typecheck
```

---

### Task 3: 补充 Worker job 处理测试

**Files:**

- Modify: `apps/worker/src/runOnce.test.ts`（若存在）或创建新测试文件

**Step 1: 测试 COMPACTION job 正常处理路径**
**Step 2: 测试 EMBEDDING_BACKFILL job 正常处理路径**
**Step 3: 测试 payload 缺失字段时抛错并进入 retry/dead-letter 路径**

```bash
bun --cwd apps/worker test
```

---

## 特性二：增强 Memory 自动提取触发策略

> **问题**：当前 memory 自动提取仅在 compaction 后触发 MEMORY_FLUSH，频率太低。

### Task 4: 添加基于轮次的自动 Memory 提取触发

**Files:**

- Modify: `packages/domain/src/usecases/chat.ts`
- Modify: `packages/api/src/router.ts`（可选 env 配置）

**Step 1: 在 `chatTurnStream` 中添加轮次计数触发逻辑**

新增 env 配置 `MEMORY_FLUSH_EVERY_N_TURNS`（默认 `20`）：

- 每 N 轮对话后（不必等 compaction），自动投递 `MEMORY_FLUSH` job。
- 投递前检查是否已有同 agent+session 的 pending MEMORY_FLUSH job，避免重复投递。

**Step 2: 可选 — 添加 `session.end` 事件触发**

当用户切换会话或创建新会话时，自动投递上一个会话的 MEMORY_FLUSH（如果该会话有足够多的新消息）。

**Step 3: 验证**

```bash
bun --cwd packages/domain test
bun run typecheck
```

---

### Task 5: Memory 提取去重

**Files:**

- Modify: `packages/domain/src/usecases/memoryExtraction.ts`

**Step 1: 提取前查询该 agent 已有 memory items**

在 LLM 提取 prompt 中附加已有记忆摘要，指示模型避免重复提取。

**Step 2: 提取后做语义去重**

对提取结果与已有记忆做 embedding 相似度比较，跳过高度相似的条目（cosine similarity > 0.92）。

**Step 3: 验证**

```bash
bun --cwd packages/domain test
```

---

## 特性三：Workspace Agent 隔离

> **问题**：`agents.workspace_id` 字段已有但查询未按 workspace 过滤。

### Task 6: Agent 查询支持 workspace 过滤

**Files:**

- Modify: `packages/domain/src/container/types.ts`
- Modify: `packages/domain/src/usecases/agent.ts`
- Modify: `packages/adapters/supabase/src/stores/agents.ts`
- Modify: `packages/api/src/router.ts`

**Step 1: `AgentStore.listAgentsByOwner` 支持可选 `workspaceId` 过滤参数**

```ts
listAgentsByOwner(ownerUserId: UUID, opts?: { workspaceId?: UUID }): Promise<Agent[]>;
```

**Step 2: agent usecase 传递 workspaceId**

**Step 3: Supabase adapter 查询添加 `.eq("workspace_id", workspaceId)` 条件**

**Step 4: `agent.list` tRPC 支持可选 `workspaceId` input**

**Step 5: 验证**

```bash
bun --cwd packages/domain test
bun run typecheck
```

---

### Task 7: Agent 创建关联 workspace

**Files:**

- Modify: `packages/api/src/router.ts`
- Modify: `apps/web/app/agents/page.tsx`

**Step 1: `agent.create` tRPC 支持可选 `workspaceId` 参数**

创建 Agent 时可指定归属 workspace。

**Step 2: UI 在创建 Agent 时选择 workspace（如果用户有 workspace）**

在 agents 页面创建 Agent 的区域增加可选的 workspace 选择器。

**Step 3: 验证**

```bash
bun run typecheck
```

---

## 特性四：产品体验打磨

### Task 8: Chat 页面交互细节优化

**Files:**

- Modify: `apps/web/app/chat/[agentId]/page.tsx`

**Step 1: 图片预览**

- 上传前显示缩略图预览，支持移除已选图片。

**Step 2: 发送状态优化**

- 发送按钮在上传图片时显示加载状态。
- 上传失败时显示具体错误提示。

**Step 3: 长消息折叠**

- 超长 AI 回复（>500 行）默认折叠，提供"展开全文"按钮。

---

### Task 9: 导航增强 — 添加模板和工作空间入口

**Files:**

- Modify: `apps/web/src/components/dashboard-shell.tsx`

**Step 1: 在侧边栏导航中增加"模板"和"团队"入口**

当前只有 聊天/Agents/记忆/轨迹/用量 五项，模板和工作空间页面虽已实现但无导航入口。

---

## 特性五：Phase 1 遗留补齐

> 来源：`docs/plans/2026-02-28-post-mvp-phase1.md` "后续（本期不做）"清单中尚未完成的 3 项。

### Task 10: 多模型前端选择器

**Files:**

- Modify: `apps/web/app/agents/page.tsx`
- Modify: `packages/api/src/router.ts`（可选：添加 `model.list` route）

**Step 1: 将 Agent 配置 Dialog 中的 model 输入框改为下拉选择器**

当前 Agent 配置 Dialog 中 model 字段是一个自由文本输入。改为下拉选择器，列出可用模型。

可用模型列表来源（按优先级）：

- 环境变量 `AVAILABLE_MODELS`（逗号分隔），例如 `gpt-4o,gpt-4o-mini,deepseek-chat`
- 默认 fallback：`[OPENAI_MODEL, OPENAI_FALLBACK_MODEL]`（去重、去空）

**Step 2: 可选 — 添加 `model.list` tRPC 查询**

从 env 解析可用模型列表并返回给前端，避免前端硬编码。

**Step 3: 验证**

```bash
bun run typecheck
```

---

### Task 11: 会话归档

**Files:**

- Modify: `packages/domain/src/container/types.ts`
- Modify: `packages/adapters/supabase/src/stores/sessions.ts`
- Modify: `packages/adapters/supabase/sql/schema.sql`（添加 `is_archived` 列）
- Modify: `packages/api/src/router.ts`
- Modify: `apps/web/app/chat/[agentId]/page.tsx`

**Step 1: 数据库添加 `sessions.is_archived` 布尔字段（默认 false）**

**Step 2: Domain port 添加 `archiveSession` / `unarchiveSession` 方法**

**Step 3: `session.list` 查询默认过滤 `is_archived=true`，支持可选 `includeArchived` 参数**

**Step 4: tRPC 添加 `session.archive` / `session.unarchive` mutation**

**Step 5: Chat 页面会话列表中增加归档/取消归档操作按钮**

**Step 6: 验证**

```bash
bun --cwd packages/domain test
bun run typecheck
```

---

### Task 12: Staging 部署流程

**Files:**

- Modify: `.github/workflows/deploy.yml`
- New: `.github/workflows/deploy-staging.yml`
- Modify: `docs/runbooks/local-experience.md`（补充 staging 说明）

**Step 1: 创建 staging 部署 workflow**

- 触发条件：push 到 `develop` 分支 或 PR preview
- 部署到 Vercel Preview Environment
- 使用独立的 Supabase staging 项目（或同项目不同 schema）

**Step 2: 环境变量分层**

- Vercel Dashboard 中区分 Production / Preview 环境变量
- Staging 使用独立的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`

**Step 3: 更新部署 runbook 文档**

---

## 验收检查

### 全局验证

```bash
bun run typecheck   # 18/18 packages
bun run test        # 所有测试全绿
```

### 手动 QA 清单

1. **Worker COMPACTION**：手动投递 COMPACTION job → 验证 compaction 逻辑执行且 job 标 completed
2. **Worker EMBEDDING_BACKFILL**：插入无 embedding 的 memory item → 投递 job → 验证 embedding 被回填
3. **Memory 自动提取频率**：连续对话 20 轮 → 验证自动投递了 MEMORY_FLUSH job 且提取了记忆
4. **Memory 去重**：重复话题对话 → 验证不会提取重复记忆
5. **Workspace Agent 隔离**：创建 workspace → 在 workspace 下创建 Agent → 验证 agent.list 带 workspaceId 只返回该 workspace 下的 Agent
6. **导航入口**：验证侧边栏可以跳转到模板市场和工作空间页面
7. **多模型选择器**：打开 Agent 配置 Dialog → 验证 model 字段为下拉选择器 → 选择不同模型后保存 → 新对话使用选定模型
8. **会话归档**：归档会话 → 验证会话从默认列表消失 → 取消归档 → 验证会话恢复
9. **Staging 部署**：推送到 develop 分支 → 验证 Preview 部署成功 → 访问 staging URL 功能正常

---

## 后续（本期不做）

- Desktop/Extension/Mobile 多端实现
- 模板市场搜索/分类/评分
- Workspace 成员 Agent 权限细粒度控制
- PDF/文档类附件支持
- 专业可观测性平台接入（Grafana/Datadog）
