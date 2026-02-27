"use client";

import Link from "next/link";
import { trpc } from "@daemon/hooks";
import { Badge, Button, Card } from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";

export default function ChatIndexPage() {
  const agents = trpc.agent.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const firstAgent = agents.data?.[0];

  return (
    <DashboardShell
      title="Chat Workspace"
      description="直接选择 Agent 开始对话，不再绕路。"
      actions={
        firstAgent ? (
          <Button asChild>
            <Link href={`/chat/${firstAgent.id}`}>进入最近 Agent</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href="/agents">去创建 Agent</Link>
          </Button>
        )
      }
    >
      <section className="space-y-4">
        <Card className="space-y-3 border-[var(--line-soft)] bg-white/90 p-6">
          <h3 className="font-display text-2xl font-semibold text-[var(--ink-strong)]">快速入口</h3>
          {agents.isLoading ? (
            <p className="text-sm text-[var(--ink-muted)]">正在加载 Agent...</p>
          ) : (agents.data?.length ?? 0) > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(agents.data ?? []).map((agent) => (
                <Card key={agent.id} className="space-y-3 border-[var(--line-soft)] bg-white p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--ink-strong)]">{agent.name}</p>
                    <p className="truncate text-xs text-[var(--ink-muted)]">{agent.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm">
                      <Link href={`/chat/${agent.id}`}>开始聊天</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="border-[var(--line-soft)] bg-white">
                      <Link href={`/usage?agent=${encodeURIComponent(agent.id)}`}>看用量</Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--ink-muted)]">还没有可用 Agent，请先创建一个。</p>
              <Button asChild className="w-fit">
                <Link href="/agents">去 Agents 创建</Link>
              </Button>
            </div>
          )}
        </Card>

        <Card className="space-y-2 border-[var(--line-soft)] bg-white/90 p-6 text-sm text-[var(--ink-muted)]">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white">SSE Streaming</Badge>
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white">Idempotency</Badge>
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white">Usage Ledger</Badge>
          </div>
          <p>发送消息后会自动记录 transcript、usage 和会话活动时间。</p>
        </Card>
      </section>
    </DashboardShell>
  );
}
