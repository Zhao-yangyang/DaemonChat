# Phase 6：生产化就绪 + 产品差异化

> 状态：执行中
>
> 更新时间：2026-03-06
>
> 前置：Phase 1–5 均已完成，MVP 全链路闭环、多模型支持、模板市场、Workspace 基础、会话归档、Memory 自动提取/去重均已就绪。

---

## 目标

将产品从"功能可跑"升级为"可运营"——补齐 E2E 测试保护网、错误边界、Landing Page；同时推进差异化能力（PDF 附件、Workspace 权限）。

## 优先级排序原则

1. **先护再扩** — E2E 测试 + 错误边界是防回归底线
2. **可运营** — Landing Page + 国际化是用户获取前提
3. **差异化** — PDF 附件 + Workspace 权限是商业化基础

---

## 特性一：E2E 测试保护网

> **问题**：当前 4300+ 行测试全是单元/API 级，无浏览器级回归保护。

### Task 1: Playwright 基础设施搭建

**Files:**

- New: `apps/web/playwright.config.ts`
- New: `apps/web/e2e/setup.ts`
- Modify: `apps/web/package.json`

**Step 1: 安装 Playwright 依赖**

```bash
cd apps/web
bun add -D @playwright/test
```

**Step 2: 创建 playwright.config.ts**

配置要点：

- `baseURL: "http://localhost:3333"`
- `webServer` 启动 `bun run dev`
- 单浏览器 chromium（CI 轻量）
- 截图和 trace 仅在失败时保留

**Step 3: 验证**

```bash
bun run typecheck
```

---

### Task 2: 核心冒烟测试 — 注册登录流程

**Files:**

- New: `apps/web/e2e/auth.spec.ts`

**Step 1: 测试首页未登录时显示登录表单**

**Step 2: 测试登录后跳转到聊天页面**

> 注意：可使用 Supabase test user 或 mock auth，避免真实邮件验证。

---

### Task 3: 核心冒烟测试 — Agent 创建与聊天

**Files:**

- New: `apps/web/e2e/chat.spec.ts`

**Step 1: 登录后创建 Agent**
**Step 2: 进入 Agent 聊天页发送消息**
**Step 3: 验证 AI 回复出现在消息列表中**

---

### Task 4: 核心冒烟测试 — Memory 与 Usage 页面

**Files:**

- New: `apps/web/e2e/pages.spec.ts`

**Step 1: 导航到 Memory 页面，验证页面加载无错误**
**Step 2: 导航到 Usage 页面，验证页面加载无错误**
**Step 3: 导航到 Templates 页面，验证页面加载无错误**

---

## 特性二：全局错误边界

> **问题**：React 组件异常时白屏，缺少 Error Boundary 和全局通知机制。

### Task 5: React Error Boundary 组件

**Files:**

- New: `apps/web/src/components/error-boundary.tsx`
- Modify: `apps/web/app/layout.tsx`

**Step 1: 创建 ErrorBoundary 组件**

使用 React class component `componentDidCatch`，展示友好的错误提示 + 重试按钮。
使用 `@daemon/ui` 的 `Alert`、`Button` 组件保持一致风格。

**Step 2: 在 layout.tsx 中包裹 children**

```tsx
<ErrorBoundary>{children}</ErrorBoundary>
```

**Step 3: 验证 typecheck**

---

### Task 6: 全局 Toast 通知系统

**Files:**

- New: `apps/web/src/components/toaster.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/src/providers.tsx`

**Step 1: 安装 shadcn toast（如未安装）**

检查 `@daemon/ui` 是否已有 `Toast` 组件，如无则通过 shadcn CLI 添加。

**Step 2: 创建 Toaster 组件并挂载到 layout**

**Step 3: 在关键错误路径使用 toast 替代 console.error**

重点改造：

- `apps/web/app/agents/page.tsx` 的 create/update 失败
- `apps/web/app/chat/[agentId]/page.tsx` 的 stream 错误

---

## 特性三：公开 Landing Page

> **问题**：`/` 页面当前是登录态入口，未登录用户无法了解产品。

### Task 7: Landing Page 设计与实现

**Files:**

- Modify: `apps/web/app/page.tsx`
- New: `apps/web/src/components/landing-hero.tsx`

**Step 1: 分离已登录和未登录视图**

```tsx
if (session) return <AuthenticatedHome />;
return <LandingPage />;
```

**Step 2: Landing Page 内容**

- Hero 区：产品名 + 一句话描述 + CTA 按钮（"开始使用"）
- 特性区：3–4 个核心卖点卡片（长期记忆 / 多模型 / 模板市场 / 团队协作）
- Footer：GitHub 链接

**Step 3: 验证响应式**

确保移动端和桌面端布局正常。

---

## 特性四：PDF / 文档附件支持

> **问题**：当前仅支持图片附件（jpeg/png/gif/webp），缺少文档类附件。

### Task 8: 后端 PDF 解析能力

**Files:**

- Modify: `apps/web/package.json`
- New: `apps/web/src/lib/pdf-parser.ts`
- Modify: `apps/web/app/api/chat/upload/route.ts`

**Step 1: 安装 PDF 解析依赖**

```bash
cd apps/web
bun add pdf-parse
```

**Step 2: 创建 PDF 文本提取工具**

```ts
export async function extractTextFromPdf(buffer: Buffer): Promise<string>;
```

**Step 3: 扩展 upload route 支持 PDF**

- 接受 `application/pdf` MIME type
- 提取文本内容并作为 `textContent` 返回给前端
- 同时存储原始文件到 Supabase Storage

---

### Task 9: 前端 PDF 上传与展示

**Files:**

- Modify: `apps/web/app/chat/[agentId]/page.tsx`

**Step 1: 扩展文件选择器接受 PDF**

```tsx
accept = "image/jpeg,image/png,image/gif,image/webp,application/pdf";
```

**Step 2: PDF 预览显示文件名 + 图标（非缩略图）**

**Step 3: PDF 文本内容作为用户消息的一部分发送**

将提取的文本以 `[文档内容: xxx]` 格式拼接到用户输入中。

---

### Task 10: 扩展 chat_attachments 表

**Files:**

- New: `supabase/migrations/20260306000000_pdf_attachments.sql`
- Modify: `packages/adapters/supabase/sql/schema.sql`

**Step 1: chat_attachments 表新增 `text_content` 列**

```sql
ALTER TABLE public.chat_attachments
ADD COLUMN IF NOT EXISTS text_content text;
```

用于存储 PDF 提取的文本内容，供后续检索和展示。

---

## 特性五：Workspace 成员权限细粒度

> **问题**：当前 workspace 有 role（owner/admin/member/viewer），但 Agent 级别无 ACL，所有成员能看到所有 workspace agents。

### Task 11: Agent 可见性控制

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/adapters/supabase/sql/schema.sql`
- Modify: `packages/adapters/supabase/src/stores/agents.ts`
- Modify: `packages/api/src/router.ts`

**Step 1: agents 表新增 `visibility` 列**

```sql
ALTER TABLE public.agents
ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';
-- 值: 'private' | 'workspace' | 'public'
```

- `private`：仅 owner 可见（现有行为）
- `workspace`：同 workspace 成员可见
- `public`：所有人可见（用于分享）

**Step 2: Agent 查询支持 workspace 成员可见**

当 `visibility = 'workspace'` 时，同 workspace 的成员也能 `getAgent`/`listAgents` 看到。

**Step 3: tRPC `agent.update` 支持修改 visibility**

**Step 4: UI Agent 设置 Dialog 新增 visibility 选择器**

---

### Task 12: Workspace 成员角色权限矩阵

**Files:**

- New: `packages/domain/src/usecases/workspace.ts`
- Modify: `packages/api/src/router.ts`

**Step 1: 定义权限矩阵**

| 操作           | owner | admin | member   | viewer |
| -------------- | ----- | ----- | -------- | ------ |
| 创建 Agent     | ✅    | ✅    | ✅       | ❌     |
| 编辑 Agent     | ✅    | ✅    | own only | ❌     |
| 删除 Agent     | ✅    | ✅    | own only | ❌     |
| 聊天           | ✅    | ✅    | ✅       | ✅     |
| 查看 Memory    | ✅    | ✅    | ✅       | ✅     |
| 邀请成员       | ✅    | ✅    | ❌       | ❌     |
| 移除成员       | ✅    | ✅    | ❌       | ❌     |
| 删除 Workspace | ✅    | ❌    | ❌       | ❌     |

**Step 2: 创建 workspace usecase 封装权限检查**

```ts
export function createWorkspaceService(ports: { ... }) {
  return {
    async checkPermission(workspaceId, userId, action): Promise<boolean>,
    async requirePermission(workspaceId, userId, action): Promise<void>,
  };
}
```

**Step 3: 在 Agent tRPC 路由中集成权限检查**

---

## 验收检查

### 全局验证

```bash
bun run typecheck   # 18/18 packages
bun run test        # 所有测试全绿
bunx playwright test --project=chromium  # E2E 冒烟通过
```

### 手动 QA 清单

1. **E2E 冒烟**：`bunx playwright test` 全绿
2. **错误边界**：在 React DevTools 中模拟组件崩溃 → 显示友好错误页而非白屏
3. **Toast 通知**：Agent 创建失败 → 显示 toast 提示
4. **Landing Page**：未登录访问 `/` → 显示产品介绍页
5. **PDF 上传**：在聊天中上传 PDF → 文本被提取并发送给模型 → AI 基于文档内容回答
6. **Agent 可见性**：设置 Agent 为 `workspace` → workspace 成员可在列表中看到
7. **权限矩阵**：viewer 角色无法创建 Agent → 返回 403

---

## 后续（本期不做）

- Desktop (Tauri) / Extension (WXT) / Mobile (Expo) 多端实现
- i18n 国际化（中/英切换）
- 对话分叉（从任意消息创建分支）
- Agent 公开分享链接
- 专业可观测性平台接入（Grafana/Datadog）
- SSO / 企业级 RBAC
