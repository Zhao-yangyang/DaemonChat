"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@daemon/hooks";
import { Badge, Button, Card, Input } from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { supabaseBrowserClient } from "@/src/supabaseClient";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) {
      return maybe.message;
    }
  }
  return fallback;
};

export default function AgentsPage() {
  const [name, setName] = useState("");
  const [authResolved, setAuthResolved] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setAuthResolved(true);
    });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setAuthResolved(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const agents = trpc.agent.list.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createAgent = trpc.agent.create.useMutation({
    onSuccess: () => {
      setName("");
      agents.refetch();
    },
  });

  const listErrorMessage = useMemo(
    () =>
      agents.error
        ? getErrorMessage(agents.error, "加载 Agent 列表失败，请稍后重试。")
        : null,
    [agents.error]
  );

  const createErrorMessage = useMemo(
    () =>
      createAgent.error
        ? getErrorMessage(createAgent.error, "创建 Agent 失败，请稍后重试。")
        : null,
    [createAgent.error]
  );

  if (!authResolved) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6">
        <Card className="border-[var(--line-soft)] bg-white/85 p-6 text-sm text-[var(--ink-muted)]">
          正在检查登录状态...
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-[900px] px-4 py-10 sm:px-6">
        <Card className="space-y-3 border-[var(--line-soft)] bg-white/90 p-6">
          <h2 className="font-display text-2xl font-semibold text-[var(--ink-strong)]">Agents</h2>
          <p className="text-sm text-[var(--ink-muted)]">请先登录再创建或查看 Agent。</p>
          <Button asChild className="w-fit">
            <Link href="/">返回登录页</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <DashboardShell
      title="Agent 工作台"
      description="管理你的长期助手实例。每个 Agent 都拥有独立会话、记忆和用量账本。"
      actions={
        <Button asChild variant="outline" className="border-[var(--line-soft)] bg-white">
          <Link href="/chat">打开聊天面板</Link>
        </Button>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="space-y-4 border-[var(--line-soft)] bg-white/90 p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Create</p>
            <h3 className="mt-1 font-display text-2xl font-semibold text-[var(--ink-strong)]">新建 Agent</h3>
          </div>

          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：Personal Ops Copilot"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Button
              onClick={() => createAgent.mutate({ name: name.trim() })}
              disabled={!name.trim() || createAgent.isPending}
              className="w-full"
            >
              {createAgent.isPending ? "创建中..." : "创建 Agent"}
            </Button>
            {createErrorMessage ? (
              <p className="text-sm text-rose-600">创建失败：{createErrorMessage}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--line-soft)] bg-[var(--brand-soft)]/60 p-4 text-sm text-[var(--ink-muted)]">
            新建后建议先进入 Chat 建立首轮上下文，再到 Memory 查看沉淀结果。
          </div>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
                Agents {agents.data?.length ?? 0}
              </Badge>
              {agents.isFetching ? (
                <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
                  刷新中
                </Badge>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="border-[var(--line-soft)] bg-white"
              onClick={() => agents.refetch()}
              disabled={agents.isFetching}
            >
              刷新列表
            </Button>
          </div>

          {listErrorMessage ? (
            <Card className="space-y-3 border-rose-200 bg-rose-50/90 p-5">
              <p className="text-sm text-rose-700">加载失败：{listErrorMessage}</p>
              <Button variant="outline" className="w-fit border-rose-200 bg-white" onClick={() => agents.refetch()}>
                重试
              </Button>
            </Card>
          ) : null}

          <div className="grid gap-3">
            {agents.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <Card
                    key={`agent-loading-${index}`}
                    className="h-24 animate-pulse border-[var(--line-soft)] bg-white/70"
                  />
                ))
              : (agents.data ?? []).map((agent) => (
                  <Card
                    key={agent.id}
                    className="space-y-4 border-[var(--line-soft)] bg-white/92 p-5 shadow-[0_10px_28px_rgba(24,38,64,0.06)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-lg font-semibold text-[var(--ink-strong)]">{agent.name}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{agent.id}</p>
                      </div>
                      <Badge variant="outline" className="border-[var(--line-soft)] bg-[var(--brand-soft)]">
                        Active
                      </Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href={`/chat/${agent.id}`}>进入聊天</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="border-[var(--line-soft)] bg-white">
                        <Link href={`/usage?agent=${encodeURIComponent(agent.id)}`}>查看用量</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="border-[var(--line-soft)] bg-white">
                        <Link href={`/memory?agent=${encodeURIComponent(agent.id)}`}>管理记忆</Link>
                      </Button>
                    </div>
                  </Card>
                ))}

            {!agents.isLoading && !listErrorMessage && (agents.data?.length ?? 0) === 0 ? (
              <Card className="border-[var(--line-soft)] bg-white/86 p-5 text-sm text-[var(--ink-muted)]">
                还没有 Agent，先在左侧创建第一个。
              </Card>
            ) : null}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
