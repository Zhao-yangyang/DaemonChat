"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Badge, Card } from "@daemon/ui";
import { ChatEntryGate } from "@/src/components/chat-entry-gate";
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
      <main className="mx-auto flex min-h-screen w-full max-w-[840px] items-center px-4 py-8 sm:px-6">
        <section className="mx-auto w-full max-w-[560px] space-y-4">
          <Badge variant="outline" className="border-[var(--line-soft)] bg-white text-[var(--ink-muted)]">
            DaemonChat
          </Badge>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-4xl">
              欢迎回来
            </h1>
            <p className="text-sm text-[var(--ink-muted)]">
              账号：{session.user?.email ?? session.user?.id}
            </p>
          </div>
          <ChatEntryGate />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-[1080px] items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_440px] lg:px-8">
      <section className="space-y-6">
        <Badge variant="outline" className="border-[var(--line-soft)] bg-white text-[var(--ink-muted)]">
          DaemonChat
        </Badge>

        <div className="space-y-3">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-[var(--ink-strong)] sm:text-5xl">
            打开即聊
            <br />
            简洁的 AI 工作台
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-[var(--ink-muted)]">
            登录后自动进入最近对话。记忆、会话记录和用量统计都围绕聊天主界面展开，不需要手动查找 Agent。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-[var(--line-soft)] bg-white p-4">
            <p className="text-sm font-semibold text-[var(--ink-strong)]">Chat First</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">默认直达聊天，不绕路。</p>
          </Card>
          <Card className="border-[var(--line-soft)] bg-white p-4">
            <p className="text-sm font-semibold text-[var(--ink-strong)]">Built-in Guardrails</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">限流、预算和审计默认启用。</p>
          </Card>
        </div>
      </section>

      <Card className="border-[var(--line-soft)] bg-white p-6">
        <div className="mb-4 space-y-1">
          <h2 className="text-2xl font-semibold text-[var(--ink-strong)]">登录</h2>
          <p className="text-sm text-[var(--ink-muted)]">使用 Supabase Auth 登录或注册。</p>
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
