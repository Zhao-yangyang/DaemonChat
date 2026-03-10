# Post-MVP Phase 1 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完成 MVP 后的第一批体验升级——Markdown 渲染、Agent 个性化配置、暗色模式。

**Architecture:** 三个独立特性可并行开发。Markdown 渲染仅改前端组件；Agent 配置需要从 domain → DB → API → UI 全栈贯通；暗色模式仅改 CSS tokens + 切换组件。

**Tech Stack:** react-markdown + remark-gfm + rehype-highlight (Markdown)；Tailwind v4 dark variant (暗色模式)；domain ports + Supabase schema + tRPC (Agent 配置)

---

## 特性一：Chat Markdown 渲染 + 代码高亮

### Task 1: 安装 Markdown 依赖

**Files:**

- Modify: `apps/web/package.json`

**Step 1: 安装依赖**

```bash
cd apps/web
bun add react-markdown remark-gfm rehype-highlight highlight.js
```

**Step 2: 验证安装**

```bash
bun run typecheck --filter @daemon/web
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/package.json bun.lock
git commit -m "feat(web): add react-markdown and highlight.js dependencies"
```

---

### Task 2: 创建 Markdown 消息渲染组件

**Files:**

- Create: `apps/web/src/components/markdown-message.tsx`

**Step 1: 创建组件**

```tsx
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@daemon/ui";

type MarkdownMessageProps = {
  content: string;
  className?: string;
};

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  return (
    <div className={cn("prose prose-sm max-w-none dark:prose-invert", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre({ children, ...props }) {
            return (
              <pre className="overflow-x-auto rounded-lg bg-secondary p-3 text-xs" {...props}>
                {children}
              </pre>
            );
          },
          code({ className: codeClassName, children, ...props }) {
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code className="rounded bg-secondary px-1 py-0.5 text-xs" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={codeClassName} {...props}>
                {children}
              </code>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto">
                <table className="text-sm" {...props}>
                  {children}
                </table>
              </div>
            );
          },
        }}
      />
    </div>
  );
}
```

**Step 2: 验证 typecheck**

```bash
bun run typecheck --filter @daemon/web
```

Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/markdown-message.tsx
git commit -m "feat(web): add MarkdownMessage component with GFM and code highlight"
```

---

### Task 3: 添加 highlight.js 代码主题样式

**Files:**

- Modify: `apps/web/app/globals.css`

**Step 1: 在 globals.css 末尾追加 highlight.js 最小主题**

在 `@layer utilities` 块之后追加：

```css
/* highlight.js minimal code theme */
.hljs {
  color: var(--foreground);
  background: var(--secondary);
}
.hljs-keyword,
.hljs-selector-tag,
.hljs-built_in {
  color: #7c3aed;
}
.hljs-string,
.hljs-attr {
  color: #059669;
}
.hljs-comment,
.hljs-quote {
  color: var(--muted-foreground);
  font-style: italic;
}
.hljs-number,
.hljs-literal {
  color: #d97706;
}
.hljs-title,
.hljs-section {
  color: #2563eb;
  font-weight: 600;
}
.hljs-type,
.hljs-name {
  color: #0891b2;
}
```

**Step 2: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): add minimal highlight.js code theme tokens"
```

---

### Task 4: 添加 prose Tailwind 排版支持

**Files:**

- Modify: `apps/web/package.json`
- Modify: `apps/web/app/globals.css`

**Step 1: 安装 typography 插件**

```bash
cd apps/web
bun add @tailwindcss/typography
```

**Step 2: 在 globals.css 中引入插件**

在 `@import "tailwindcss";` 之后追加：

```css
@plugin "@tailwindcss/typography";
```

**Step 3: 验证**

```bash
bun run typecheck --filter @daemon/web
```

**Step 4: Commit**

```bash
git add apps/web/package.json apps/web/app/globals.css bun.lock
git commit -m "feat(web): add tailwind typography plugin for prose classes"
```

---

### Task 5: 将 Chat 页面接入 MarkdownMessage

**Files:**

- Modify: `apps/web/app/chat/[agentId]/page.tsx`

**Step 1: 替换 AI 消息的纯文本渲染为 MarkdownMessage**

在 imports 区域添加：

```tsx
import { MarkdownMessage } from "@/src/components/markdown-message";
```

将消息气泡内的 `<p className="whitespace-pre-wrap">` 替换为条件渲染：

- 用户消息：保持 `<p className="whitespace-pre-wrap">`（用户输入不需要 Markdown）
- AI 消息：使用 `<MarkdownMessage content={msg.content} />`
- pending 状态：保持 "思考中..." 纯文本

具体替换位置（当前约第 358 行）：

```tsx
{
  isUser ? (
    <p className="whitespace-pre-wrap">{msg.content}</p>
  ) : msg.content ? (
    <MarkdownMessage content={msg.content} />
  ) : isPendingAssistant ? (
    <p className="text-muted-foreground">思考中...</p>
  ) : null;
}
```

**Step 2: AI 消息气泡移除 `text-sm leading-relaxed`**（prose 自带排版），保留背景和圆角：

将 AI 消息气泡 class 改为：

```tsx
isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground";
```

**Step 3: 验证**

```bash
bun run typecheck --filter @daemon/web
```

**Step 4: 手动验证**

启动 `bun run dev --filter @daemon/web`，发送包含 Markdown 的消息验证渲染效果：

- 发送：`请用代码示例解释 JavaScript 的 Promise`
- 期望：代码块有语法高亮，正文有排版

**Step 5: Commit**

```bash
git add apps/web/app/chat/[agentId]/page.tsx
git commit -m "feat(web): render AI chat messages with Markdown and code highlight"
```

---

## 特性二：暗色模式

### Task 6: 添加 dark 模式 CSS tokens

**Files:**

- Modify: `apps/web/app/globals.css`

**Step 1: 在 `:root` 块之后添加 `.dark` 选择器**

```css
.dark {
  color-scheme: dark;
  --background: #171717;
  --foreground: #ededed;
  --card: #232323;
  --card-foreground: #ededed;
  --popover: #232323;
  --popover-foreground: #ededed;
  --primary: #3b82f6;
  --primary-foreground: #ffffff;
  --secondary: #2a2a2a;
  --secondary-foreground: #ededed;
  --muted: #2a2a2a;
  --muted-foreground: #a1a1aa;
  --accent: #2a2a2a;
  --accent-foreground: #ededed;
  --destructive: #ef4444;
  --border: #333333;
  --input: #333333;
  --ring: #3b82f6;

  --sidebar: #1e1e1e;
  --sidebar-foreground: #ededed;
  --sidebar-muted: #52525b;

  --accent-green: #34d399;
}
```

**Step 2: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): add dark mode CSS tokens"
```

---

### Task 7: 创建主题切换组件

**Files:**

- Create: `apps/web/src/components/theme-toggle.tsx`
- Create: `apps/web/src/hooks/use-theme.ts`

**Step 1: 创建 useTheme hook**

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "daemon-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored ?? "system";
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  return { theme, setTheme };
}
```

**Step 2: 创建 ThemeToggle 组件**

```tsx
"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@daemon/ui";
import { useTheme } from "@/src/hooks/use-theme";

const icons: Record<string, React.ElementType> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const next: Record<string, "light" | "dark" | "system"> = {
  light: "dark",
  dark: "system",
  system: "light",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const Icon = icons[theme] ?? Monitor;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next[theme] ?? "light")}
      title={`当前：${theme}`}
    >
      <Icon className="size-4" />
      <span className="sr-only">切换主题</span>
    </Button>
  );
}
```

**Step 3: 验证**

```bash
bun run typecheck --filter @daemon/web
```

**Step 4: Commit**

```bash
git add apps/web/src/hooks/use-theme.ts apps/web/src/components/theme-toggle.tsx
git commit -m "feat(web): add theme toggle with light/dark/system support"
```

---

### Task 8: 将 ThemeToggle 集成到 DashboardShell

**Files:**

- Modify: `apps/web/src/components/dashboard-shell.tsx`

**Step 1: 在 sidebar 底部退出按钮上方添加 ThemeToggle**

import ThemeToggle：

```tsx
import { ThemeToggle } from "@/src/components/theme-toggle";
```

在 `SidebarNav` 的 `<Separator />` 与用户信息之间插入：

```tsx
<div className="px-3 py-2">
  <ThemeToggle />
</div>
```

**Step 2: 验证 + 手动测试暗色模式切换**

```bash
bun run typecheck --filter @daemon/web
```

**Step 3: Commit**

```bash
git add apps/web/src/components/dashboard-shell.tsx
git commit -m "feat(web): integrate ThemeToggle into sidebar navigation"
```

---

### Task 9: 修复暗色模式下 highlight.js 代码主题

**Files:**

- Modify: `apps/web/app/globals.css`

**Step 1: 在 hljs 规则中追加 dark 变体覆盖**

```css
.dark .hljs-keyword,
.dark .hljs-selector-tag,
.dark .hljs-built_in {
  color: #a78bfa;
}
.dark .hljs-string,
.dark .hljs-attr {
  color: #34d399;
}
.dark .hljs-number,
.dark .hljs-literal {
  color: #fbbf24;
}
.dark .hljs-title,
.dark .hljs-section {
  color: #60a5fa;
}
.dark .hljs-type,
.dark .hljs-name {
  color: #22d3ee;
}
```

**Step 2: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "style(web): add dark mode highlight.js overrides"
```

---

## 特性三：Agent 个性化配置

### Task 10: 扩展 Agent domain 类型

**Files:**

- Modify: `packages/domain/src/types.ts`

**Step 1: 在 `Agent` interface 中添加可选配置字段**

在 `updatedAt` 之后追加：

```ts
export interface Agent {
  id: UUID;
  ownerUserId: UUID;
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  config: AgentConfig;
}

export interface AgentConfig {
  systemPrompt: string;
  model: string;
  memoryTopK: number;
  recentMessages: number;
  temperature: number;
}

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  systemPrompt: "You are a helpful AI assistant.",
  model: "",
  memoryTopK: 8,
  recentMessages: 20,
  temperature: 0.7,
};
```

**Step 2: 验证 typecheck 失败**（预期：所有引用 Agent 的地方缺少 config 字段）

```bash
bun run typecheck 2>&1 | head -30
```

Expected: 类型错误

**Step 3: Commit**

```bash
git add packages/domain/src/types.ts
git commit -m "feat(domain): add AgentConfig type with systemPrompt/model/temperature fields"
```

---

### Task 11: 更新 AgentStore 接口与 agent usecase

**Files:**

- Modify: `packages/domain/src/container/types.ts`
- Modify: `packages/domain/src/usecases/agent.ts`

**Step 1: AgentStore.createAgent 入参增加 config**

```ts
createAgent(input: { ownerUserId: UUID; name: string; config: AgentConfig; now: Timestamp }): Promise<Agent>;
```

同时添加 `updateAgent` 方法：

```ts
updateAgent(input: { agentId: UUID; name?: string; config?: Partial<AgentConfig>; now: Timestamp }): Promise<Agent>;
```

别忘了在文件顶部 import `AgentConfig`。

**Step 2: agent.ts usecase 更新**

- `createAgent` 新增可选 `config` 参数，默认使用 `DEFAULT_AGENT_CONFIG`
- 新增 `updateAgent` 方法：先 `getAgent` 做归属校验，再调 `ports.agents.updateAgent`

```ts
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from "../types";

async createAgent(ownerUserId: string, name: string, config?: Partial<AgentConfig>): Promise<Agent> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new ValidationError("Agent name is required");
  }
  return ports.agents.createAgent({
    ownerUserId,
    name: trimmed,
    config: { ...DEFAULT_AGENT_CONFIG, ...config },
    now: ports.clock.now(),
  });
},

async updateAgent(agentId: string, ownerUserId: string, updates: { name?: string; config?: Partial<AgentConfig> }): Promise<Agent> {
  await this.getAgent(agentId, ownerUserId); // ownership check
  if (updates.name !== undefined) {
    const trimmed = updates.name.trim();
    if (!trimmed) throw new ValidationError("Agent name is required");
    updates = { ...updates, name: trimmed };
  }
  return ports.agents.updateAgent({
    agentId,
    name: updates.name,
    config: updates.config,
    now: ports.clock.now(),
  });
},
```

**Step 3: Commit**

```bash
git add packages/domain/src/container/types.ts packages/domain/src/usecases/agent.ts
git commit -m "feat(domain): add updateAgent usecase and AgentConfig to createAgent"
```

---

### Task 12: 更新 in-memory test stores

**Files:**

- Modify: `packages/domain/src/testing/memoryStores.ts`

**Step 1: 更新 in-memory AgentStore**

- `createAgent` 写入 `config` 字段
- 新增 `updateAgent` 实现（内存 map 上合并 config）

**Step 2: 验证 domain tests**

```bash
bun --cwd packages/domain test
```

**Step 3: Commit**

```bash
git add packages/domain/src/testing/memoryStores.ts
git commit -m "feat(domain): update in-memory agent store with config and updateAgent"
```

---

### Task 13: 更新 agent domain 测试

**Files:**

- Modify: `packages/domain/src/__tests__/agent.test.ts`

**Step 1: 添加测试用例**

- `createAgent` 默认 config 使用 `DEFAULT_AGENT_CONFIG`
- `createAgent` 自定义 config 合并覆盖
- `updateAgent` 修改 name 和部分 config
- `updateAgent` 越权校验

**Step 2: 运行测试**

```bash
bun --cwd packages/domain test
```

Expected: ALL PASS

**Step 3: Commit**

```bash
git add packages/domain/src/__tests__/agent.test.ts
git commit -m "test(domain): add agent config and updateAgent test cases"
```

---

### Task 14: 更新 Supabase schema 和 adapter

**Files:**

- Modify: `packages/adapters/supabase/sql/schema.sql`
- Modify: `packages/adapters/supabase/src/stores/agents.ts`

**Step 1: schema.sql agents 表添加 config 列**

在 `create table` 语句中追加（使用 `ALTER TABLE` 做 idempotent migration）：

```sql
-- Agent config (added post-MVP)
alter table public.agents add column if not exists config jsonb not null default '{}';
```

**Step 2: adapter mapAgent 映射 config**

```ts
import { DEFAULT_AGENT_CONFIG, type AgentConfig } from "@daemon/domain";

const mapAgent = (row: any): Agent => ({
  id: row.id,
  ownerUserId: row.owner_user_id,
  name: row.name,
  config: { ...DEFAULT_AGENT_CONFIG, ...(row.config ?? {}) } as AgentConfig,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
```

**Step 3: createAgent 写入 config**

```ts
async createAgent({ ownerUserId, name, config, now }) {
  const { data, error } = await client
    .from("agents")
    .insert({ owner_user_id: ownerUserId, name, config, created_at: now, updated_at: now })
    .select("*")
    .single();
  if (error) throw error;
  return mapAgent(data);
},
```

**Step 4: 新增 updateAgent**

```ts
async updateAgent({ agentId, name, config, now }) {
  const updates: Record<string, unknown> = { updated_at: now };
  if (name !== undefined) updates.name = name;
  if (config !== undefined) {
    // 先读取现有 config，合并
    const { data: existing } = await client.from("agents").select("config").eq("id", agentId).single();
    updates.config = { ...(existing?.config ?? {}), ...config };
  }
  const { data, error } = await client
    .from("agents")
    .update(updates)
    .eq("id", agentId)
    .select("*")
    .single();
  if (error) throw error;
  return mapAgent(data);
},
```

**Step 5: 验证 typecheck**

```bash
bun run typecheck
```

**Step 6: Commit**

```bash
git add packages/adapters/supabase/sql/schema.sql packages/adapters/supabase/src/stores/agents.ts
git commit -m "feat(supabase): add agents.config column and updateAgent adapter"
```

---

### Task 15: 添加 tRPC agent.update 路由

**Files:**

- Modify: `packages/api/src/router.ts`

**Step 1: 在 `agent` router 中添加 update mutation**

```ts
update: t.procedure
  .input(z.object({
    agentId: z.string().min(1),
    name: z.string().min(1).optional(),
    config: z.object({
      systemPrompt: z.string().optional(),
      model: z.string().optional(),
      memoryTopK: z.number().int().min(1).max(50).optional(),
      recentMessages: z.number().int().min(1).max(100).optional(),
      temperature: z.number().min(0).max(2).optional(),
    }).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const user = requireUser(ctx);
    return withInfrastructureErrorMapping(() =>
      ctx.container.agent.updateAgent(input.agentId, user.id, {
        name: input.name,
        config: input.config,
      })
    );
  }),
```

**Step 2: 验证 typecheck**

```bash
bun run typecheck
```

**Step 3: Commit**

```bash
git add packages/api/src/router.ts
git commit -m "feat(api): add agent.update tRPC mutation for config changes"
```

---

### Task 16: Chat 路由读取 Agent config

**Files:**

- Modify: `apps/web/app/api/chat/stream/route.ts`
- Modify: `packages/api/src/router.ts` (chat.turn 路径)

**Step 1: stream route 在 agent 归属校验后读取 agent.config**

找到 `agent.getAgent(agentId, user.id)` 调用后，用 agent.config 覆盖 DEFAULT_BUDGET：

```ts
const agent = await container.agent.getAgent(body.agentId, user.id);
const agentConfig = agent.config;
const effectiveBudget = {
  ...defaultBudget,
  ...(agentConfig.memoryTopK ? { memoryTopK: agentConfig.memoryTopK } : {}),
  ...(agentConfig.recentMessages ? { recentMessages: agentConfig.recentMessages } : {}),
};
const systemPrompt = agentConfig.systemPrompt || body.system || "You are a helpful AI assistant.";
```

**Step 2: 同样更新 tRPC `chat.turn` 路径**

在 `packages/api/src/router.ts` 的 `chat.turn` handler 中类似处理。

**Step 3: 验证**

```bash
bun run typecheck
bun run test
```

**Step 4: Commit**

```bash
git add apps/web/app/api/chat/stream/route.ts packages/api/src/router.ts
git commit -m "feat(web): chat stream uses agent-level config for system prompt and budget"
```

---

### Task 17: Agent 配置编辑 UI

**Files:**

- Modify: `apps/web/app/agents/page.tsx`

**Step 1: 在 Agent 列表卡片中添加"配置"按钮和内联编辑 Dialog**

使用已有的 `Dialog` / `Label` / `Input` / `Textarea` / `Select` 组件。

Dialog 内表单字段：

- System Prompt（Textarea）
- 模型（Input，placeholder 显示当前 env 默认值）
- Memory TopK（Input type=number）
- Recent Messages（Input type=number）
- Temperature（Input type=number, step=0.1）

提交调用 `trpc.agent.update.useMutation`。

**Step 2: 验证**

```bash
bun run typecheck --filter @daemon/web
```

**Step 3: 手动验证**

- 打开 `/agents` 页面
- 点击某个 Agent 的"配置"按钮
- 修改 system prompt，保存
- 进入该 Agent 聊天，验证 AI 回复风格变化

**Step 4: Commit**

```bash
git add apps/web/app/agents/page.tsx
git commit -m "feat(web): add Agent config editing dialog in agents page"
```

---

## 验收检查

### 全局验证

```bash
bun run typecheck
bun run test
```

### 手动 QA 清单

1. **Markdown 渲染**：发送含代码块、表格、列表的消息，验证渲染效果
2. **暗色模式**：点击 sidebar 底部切换按钮，验证 light → dark → system 循环
3. **Agent 配置**：修改 Agent 的 system prompt 后对话，确认行为变化
4. **配置持久化**：修改 Agent 配置后刷新页面，确认配置不丢失

---

## 后续（本期不做）

- Agent 删除
- 会话重命名/删除/归档
- Memory 自动提取
- 多模型前端选择器
- 对话导出
- Staging 部署流程
