"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Badge, Button, Card } from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { supabaseBrowserClient } from "@/src/supabaseClient";

export default function HomePage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session) {
    return (
      <DashboardShell
        title="欢迎回来"
        description="继续构建你的长期 Agent。你可以直接管理记忆、查看会话、追踪成本并实时调优策略。"
        actions={
          <Button asChild>
            <Link href="/agents">创建或选择 Agent</Link>
          </Button>
        }
      >
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="space-y-3 border-[var(--line-soft)] bg-white/88 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Identity</p>
            <p className="text-sm font-medium text-[var(--ink-strong)]">
              {session.user?.email ?? session.user?.id}
            </p>
            <p className="text-sm text-[var(--ink-muted)]">当前会话已接入 tRPC 与 SSE 路由。</p>
          </Card>

          <Card className="space-y-3 border-[var(--line-soft)] bg-white/88 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Core Loop</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-[var(--line-soft)] bg-[var(--brand-soft)]">
                Agent
              </Badge>
              <Badge variant="outline" className="border-[var(--line-soft)] bg-[var(--brand-soft)]">
                Memory
              </Badge>
              <Badge variant="outline" className="border-[var(--line-soft)] bg-[var(--brand-soft)]">
                Usage
              </Badge>
              <Badge variant="outline" className="border-[var(--line-soft)] bg-[var(--brand-soft)]">
                Streaming
              </Badge>
            </div>
            <p className="text-sm text-[var(--ink-muted)]">可直接在面板内完成创建、对话、检索、审计闭环。</p>
          </Card>

          <Card className="space-y-3 border-[var(--line-soft)] bg-white/88 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Quick Actions</p>
            <div className="grid gap-2">
              <Button asChild variant="outline" className="justify-start border-[var(--line-soft)] bg-white">
                <Link href="/chat">进入聊天面板</Link>
              </Button>
              <Button asChild variant="outline" className="justify-start border-[var(--line-soft)] bg-white">
                <Link href="/usage">查看成本与令牌</Link>
              </Button>
              <Button asChild variant="outline" className="justify-start border-[var(--line-soft)] bg-white">
                <Link href="/transcripts">检查会话轨迹</Link>
              </Button>
            </div>
          </Card>
        </section>
      </DashboardShell>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1120px] items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
      <section className="space-y-7">
        <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80 text-[var(--ink-muted)]">
          DaemonChat · Long-term Assistant
        </Badge>

        <div className="space-y-4">
          <h1 className="font-display text-4xl font-semibold leading-tight text-[var(--ink-strong)] sm:text-5xl">
            不只是聊天窗口
            <br />
            是你的 Agent 控制台
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-[var(--ink-muted)]">
            从记忆沉淀、上下文裁剪到成本监控，DaemonChat 把长期助手真正需要的能力放在同一个工作流里。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-[var(--line-soft)] bg-white/88 p-4">
            <p className="text-sm font-semibold text-[var(--ink-strong)]">Session + Memory</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">跨轮对话可持续，记忆可检索、可过滤。</p>
          </Card>
          <Card className="border-[var(--line-soft)] bg-white/88 p-4">
            <p className="text-sm font-semibold text-[var(--ink-strong)]">Guardrails</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">限流、hard cap、预算降级、审计链全部可追踪。</p>
          </Card>
        </div>
      </section>

      <Card className="border-[var(--line-soft)] bg-white/92 p-6 shadow-[0_24px_50px_rgba(24,38,64,0.10)]">
        <div className="mb-4 space-y-1">
          <h2 className="font-display text-2xl font-semibold text-[var(--ink-strong)]">登录开始</h2>
          <p className="text-sm text-[var(--ink-muted)]">使用 Supabase Auth 创建账号或登录。</p>
        </div>
        <Auth
          supabaseClient={supabaseBrowserClient}
          appearance={{ theme: ThemeSupa }}
          providers={[]}
        />
      </Card>
    </main>
  );
}
