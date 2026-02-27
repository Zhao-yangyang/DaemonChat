import Link from "next/link";
import { Button, Card } from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";

export default function ChatIndexPage() {
  return (
    <DashboardShell
      title="Chat Workspace"
      description="请选择一个 Agent 开始实时对话。流式通道会自动回传 request id 与 token 轨迹。"
      actions={
        <Button asChild>
          <Link href="/agents">去选择 Agent</Link>
        </Button>
      }
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 border-[var(--line-soft)] bg-white/90 p-6">
          <h3 className="font-display text-2xl font-semibold text-[var(--ink-strong)]">开始前检查</h3>
          <ul className="space-y-2 text-sm text-[var(--ink-muted)]">
            <li>1. 已登录并创建至少一个 Agent。</li>
            <li>2. `OPENAI_MODEL` 与 `OPENAI_API_KEY` 配置可用。</li>
            <li>3. 如需稳态体验，可配置 `OPENAI_FALLBACK_MODEL`。</li>
          </ul>
        </Card>

        <Card className="space-y-4 border-[var(--line-soft)] bg-white/90 p-6">
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">
            进入 Agent 聊天页后，系统会通过 `/api/chat/stream` 建立 SSE 流。出现重试场景时，
            幂等键会避免重复写入 transcript 和重复计费。
          </p>
          <Button asChild className="w-fit">
            <Link href="/agents">打开 Agent 列表</Link>
          </Button>
        </Card>
      </section>
    </DashboardShell>
  );
}
