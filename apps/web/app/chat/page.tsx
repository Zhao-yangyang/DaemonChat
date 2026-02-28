"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@daemon/ui";
import { ChatEntryGate } from "@/src/components/chat-entry-gate";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { supabaseBrowserClient } from "@/src/supabaseClient";

export default function ChatIndexPage() {
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

  if (!authResolved) {
    return (
      <main className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6">
        <Card className="border-[var(--line-soft)] bg-white p-4 text-sm text-[var(--ink-muted)]">
          正在检查登录状态...
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-6">
        <Card className="space-y-3 border-[var(--line-soft)] bg-white p-6">
          <h2 className="text-xl font-semibold text-[var(--ink-strong)]">请先登录</h2>
          <p className="text-sm text-[var(--ink-muted)]">登录后会自动进入最近聊天会话。</p>
          <Button asChild className="w-fit">
            <Link href="/">返回登录页</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <DashboardShell
      title="Chat"
      description="正在为你打开最近会话。"
      actions={
        <Button asChild variant="outline" className="border-[var(--line-soft)] bg-white">
          <Link href="/agents">管理 Agents</Link>
        </Button>
      }
    >
      <ChatEntryGate />
    </DashboardShell>
  );
}
