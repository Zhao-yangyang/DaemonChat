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

## 5. 常见问题

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
