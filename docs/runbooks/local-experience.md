# Local Experience Runbook

目标：在本机快速体验当前 DaemonChat（登录 -> 建 Agent -> 聊天 -> 看 Memory/Transcript/Usage）。

## 1. 准备 Supabase

1. 创建一个 Supabase 项目。
2. 在 Supabase SQL Editor 依次执行：
   - `packages/adapters/supabase/sql/schema.sql`
   - `packages/adapters/supabase/sql/rls.sql`
3. 在 Supabase Auth 设置里开启 Email 登录（默认即可）。

注意：`rls.sql` 里的 policy 语句不是可重复执行版本，建议在新项目上执行一次。

## 2. 配置 Web 环境变量

1. 复制模板：

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

2. 填写这些必填项：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
3. 默认模型可先保持：
   - `OPENAI_MODEL=gpt-4o-mini`
   - `OPENAI_EMBED_MODEL=text-embedding-3-small`

### 2.1 只有 DeepSeek key 的推荐配置

把 `.env.local` 改成下面这组：

```bash
OPENAI_API_KEY=你的_deepseek_key
OPENAI_BASE_URL=https://api.deepseek.com
LLM_PROVIDER_NAME=deepseek
LLM_COMPATIBILITY=compatible

OPENAI_MODEL=deepseek-chat
OPENAI_FALLBACK_MODEL=deepseek-chat
OPENAI_EMBED_MODEL=local-embedding
EMBEDDING_MODE=local
ALLOW_LOCAL_EMBEDDING_FALLBACK=1
LOCAL_EMBED_DIMENSIONS=1536
```

说明：

- 聊天走 DeepSeek 的 OpenAI 兼容接口。
- 可选 `OPENAI_FALLBACK_MODEL`：主模型失败时自动回退（同提供商内）。
- embedding 使用本地确定性向量（不依赖远端 embedding API），这样 Memory/Chat 流程都能完整跑起来。

### 2.2 可选：开启超限前预算降级

当接近日/月 token hard cap 时，自动先收紧预算（而不是直接 429）：

```bash
CHAT_BUDGET_DEGRADE_ENABLED=1
CHAT_DEGRADE_RESERVE_OUTPUT_TOKENS=512
CHAT_DEGRADE_MEMORY_TOPK=4
CHAT_DEGRADE_RECENT_MESSAGES=10
```

效果：

- 优先降低预留输出 token。
- 同时下调 memory topK 与 recent messages。
- 降级决策会写入 usage/audit，便于复盘。

### 2.3 可选：限制单轮输入长度（防超长提示词）

```bash
CHAT_MAX_INPUT_TOKENS=4096
```

效果：

- 超过阈值的单轮输入会在模型调用前被拒绝。
- `chat.turn` 返回 `BAD_REQUEST`，`/api/chat/stream` 返回 `413`。
- 审计会记录 `chat_input_too_large` 事件。

## 3. 启动并体验 Web

在仓库根目录：

```bash
bun install
bun run dev --filter @daemon/web
```

打开 `http://localhost:3333` 后按这个顺序体验：

1. 首页注册/登录。
2. 进入 `Agents` 页面创建一个 Agent。
3. 点击“聊天”进入 `/chat/{agentId}` 发消息（走 SSE）。
4. 去 `Memory` 页创建记忆，回到聊天继续问。
5. 去 `Transcripts` 看会话事件。
6. 去 `Usage` 看 token/cost 汇总。

## 4. 可选：启动 Worker

如果要体验队列消费与重试逻辑：

1. 复制模板并填值：

```bash
cp apps/worker/.env.example apps/worker/.env
```

2. 填写：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. 启动：

```bash
bun run dev --filter @daemon/worker
```

## 5. 运行 E2E 测试

若要运行包含登录后流程的 E2E（Agent 创建 + 聊天），需配置测试用户：

1. 在 Supabase Auth 中创建测试用户（或通过注册页手动注册）。
2. 在 `apps/web/.env.local` 中添加：
   ```
   E2E_TEST_EMAIL=测试用户邮箱
   E2E_TEST_PASSWORD=测试用户密码
   ```
3. 在 `apps/web` 目录下运行完整 E2E（含登录后聊天）：
   ```bash
   bun run test:e2e:full
   ```
4. 仅运行未登录冒烟测试（不需要 E2E 认证，默认 `test:e2e`）：
   ```bash
   bun run test:e2e
   ```

说明：`E2E_TEST_*` 未配置时，`test:e2e:full` 会在 setup 阶段报错并提示配置；`test:e2e` 冒烟测试不受影响。  
可选：设置 `E2E_PUBLIC_AGENT_ID` 为一个 `visibility=public` 的 Agent ID，`share.spec.ts` 会验证该 Share 页的展示（名称、试用按钮等）。

## 6. 推送数据库迁移（Supabase CLI）

当 `supabase/migrations/` 中有新的 SQL 迁移文件时，可用 Supabase CLI 推送到远程数据库：

```bash
bun run db:push
```

或直接：

```bash
supabase db push
```

**前置条件**：需已执行 `supabase link` 关联远程项目（或通过 `supabase login` 登录后首次 push 时按提示关联）。

**若出现 TLS EOF 连接错误**：

1. 可尝试使用 direct 连接串显式指定：

   ```bash
   SUPABASE_DB_URL="postgresql://postgres:[数据库密码]@db.[项目REF].supabase.co:5432/postgres" bun run db:push:url
   ```

   其中项目 REF 可在 Supabase Dashboard → Settings → General 中查看；密码在 Settings → Database → Database password。

2. 若 CLI 仍无法连接，可在 Supabase Dashboard → SQL Editor 中**手动执行**未应用的迁移文件，例如：
   - `supabase/migrations/20260309000000_agents_public_read_policy.sql`
   - `supabase/migrations/20260309010000_session_fork.sql`

   执行顺序按文件名时间戳从小到大。

## 7. 常见问题

- 401 Unauthorized：
  - 浏览器 session 丢失，重新登录。
  - `NEXT_PUBLIC_SUPABASE_*` 与 `SUPABASE_*` 指向了不同项目。
- 403/404 Agent：
  - 当前账号不是该 agent 所有者，或 agent 不存在。
- `agent.list` / 创建 Agent 报 500：
  - 先看页面错误文案；如果提示 schema 未就绪，重新执行：
    - `packages/adapters/supabase/sql/schema.sql`
    - `packages/adapters/supabase/sql/rls.sql`
  - 如果提示 permission denied / `42501`，说明 RLS/登录态不一致：重新登录并核对 `rls.sql` 是否完整执行。
- 聊天请求失败（5xx）：
  - `OPENAI_API_KEY` 未配置或不可用。
- 看不到 Usage 增长：
  - 先确认聊天请求成功完成（有 assistant 输出）。

## 8. Staging 部署（Vercel）

### 8.1 Vercel 项目设置

1. 在 Vercel 新建项目并导入本仓库。
2. Root Directory 选择 `apps/web`。
3. Build & Output Settings 采用仓库内配置（`vercel.json` + Next.js 默认）。

### 8.2 Staging 环境变量（Web）

在 Vercel Dashboard 设置环境变量时，请**针对 Preview 环境**单独设置一组对应 Staging 数据库配置（推荐使用独立的 Supabase 项目或 schema）：

最少需要配置（注意勾选 Environment 为 `Preview`）：

- `NEXT_PUBLIC_SUPABASE_URL` （指向 Staging）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` （指向 Staging）
- `SUPABASE_URL` （指向 Staging）
- `SUPABASE_ANON_KEY` （指向 Staging）
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBED_MODEL`

建议同步配置（成本/稳定性相关）：

- `OPENAI_FALLBACK_MODEL`
- `MODEL_CONTEXT_WINDOW`
- `RESERVE_OUTPUT_TOKENS`
- `RESERVE_TOOL_TOKENS`
- `MEMORY_TOPK`
- `RECENT_MESSAGES`
- `CHAT_QPS_LIMIT`
- `CHAT_QPM_LIMIT`
- `CHAT_DAILY_TOKEN_HARD_CAP`
- `CHAT_MONTHLY_TOKEN_HARD_CAP`
- `CHAT_MAX_INPUT_TOKENS`
- `MODEL_PRICING_JSON`（或 `OPENAI_INPUT_PRICE_PER_1M` + `OPENAI_OUTPUT_PRICE_PER_1M`）

### 8.3 Cron Worker 配置（Vercel 内置）

后台任务（MEMORY_FLUSH / COMPACTION / EMBEDDING_BACKFILL）通过 Vercel Cron 触发 `/api/internal/jobs/drain` 路由处理，无需独立 Worker 平台。

Vercel 项目需要额外配置以下环境变量：

- `CRON_SECRET`（自定义密钥，Vercel Cron 请求鉴权用）
- `SUPABASE_SERVICE_ROLE_KEY`（service role key，drain 路由用于跨用户操作 jobs 表）

`vercel.json` 已内置 Cron 配置（每分钟触发）：

```json
"crons": [{ "path": "/api/internal/jobs/drain", "schedule": "* * * * *" }]
```

Cron 路由特性：

- 每次最多处理 20 个 job，时间预算 50 秒
- 自动回收卡死超过 5 分钟的 `processing` 状态 job
- 队列深度超过阈值（默认 50）时触发 warn 级别告警
- 失败率超过 50% 时触发 warn 级别告警

### 8.4 独立 Worker 部署（可选）

如需更高频轮询（<1 分钟），可另外部署 `@daemon/worker`（Railway/fly.io/Render）。

Worker 必需环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_MODEL`
- `OPENAI_EMBED_MODEL`
- `OPENAI_API_KEY`

建议在 Staging 环境中先验证：

- `bun run loadtest:chat`
- `bun run loadtest:claim`

## 9. 生产排障

### 9.1 Supabase RLS 验证

如果遇到 `42501 permission denied` 或数据不可见，按以下步骤检查：

```sql
-- 1. 确认 RLS 已启用
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- 2. 列出所有 policy
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- 3. 用特定用户身份验证
SET request.jwt.claim.sub = '<user-uuid>';
SELECT * FROM agents WHERE owner_user_id = '<user-uuid>';
RESET request.jwt.claim.sub;
```

如果 policy 缺失或不完整：

1. 先 `DROP POLICY IF EXISTS <policy_name> ON <table>` 清理残留
2. 重新执行 `packages/adapters/supabase/sql/rls.sql`

### 9.2 常见生产错误

| 错误                       | 可能原因                     | 快速修复                                          |
| -------------------------- | ---------------------------- | ------------------------------------------------- |
| `500` on `/api/trpc/*`     | SUPABASE_URL/ANON_KEY 未配置 | 检查 Vercel 环境变量                              |
| `42P01` relation not found | schema 未执行                | 执行 `schema.sql`                                 |
| `42501` permission denied  | RLS policy 缺失              | 执行 `rls.sql`                                    |
| `429` Too Many Requests    | 触发限流/hard cap            | 检查 `CHAT_QPS_LIMIT`/`CHAT_DAILY_TOKEN_HARD_CAP` |
| Cron 返回 `401`            | `CRON_SECRET` 不匹配         | 检查 Vercel env 与 cron 请求头                    |
| Job 一直 `processing`      | 函数超时后卡死               | drain 路由自动回收（5 分钟阈值）                  |

### 9.3 回滚流程

1. 在 Vercel Dashboard > Deployments 找到上一个正常的 production deployment
2. 点击 "..." > "Promote to Production"
3. 验证回滚后功能正常
4. 排查问题后再重新部署
