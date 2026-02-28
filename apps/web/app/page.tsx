"use client";

import Link from "next/link";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@daemon/ui";
import { ChatEntryGate } from "@/src/components/chat-entry-gate";
import { useSession } from "@/src/hooks/use-session";
import { supabaseBrowserClient } from "@/src/supabaseClient";

export default function HomePage() {
  const { session } = useSession();

  if (session) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8 sm:px-6">
        <section className="w-full space-y-5">
          <Badge variant="secondary">DaemonChat</Badge>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight sm:text-3xl">欢迎回来</CardTitle>
              <CardDescription>账号：{session.user?.email ?? session.user?.id}</CardDescription>
            </CardHeader>
          </Card>
          <ChatEntryGate />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_400px] lg:px-8">
      <section className="space-y-6">
        <Badge variant="secondary">DaemonChat</Badge>

        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            打开即聊
            <br />
            一个干净的 AI 工作台
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            登录后自动进入最近会话。Agent、记忆与用量都围绕聊天主流程，不需要手动查找入口或复制 ID。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Chat First</CardTitle>
              <CardDescription>默认直达聊天，不绕路。</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Built-in Guardrails</CardTitle>
              <CardDescription>限流、预算和审计默认启用。</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">开始使用</CardTitle>
          <CardDescription>使用邮箱登录或注册。</CardDescription>
        </CardHeader>
        <CardContent>
          <Auth
            supabaseClient={supabaseBrowserClient}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: "#2563eb",
                    brandAccent: "#1d4ed8",
                    inputBackground: "#ffffff",
                    inputBorder: "#e4e4e7",
                    inputBorderHover: "#2563eb",
                    inputBorderFocus: "#2563eb",
                    inputText: "#0d0d0d",
                    defaultButtonBackground: "#f0f0f1",
                    defaultButtonBackgroundHover: "#e4e4e7",
                    defaultButtonBorder: "#e4e4e7",
                    defaultButtonText: "#18181b",
                    anchorTextColor: "#2563eb",
                  },
                },
              },
            }}
            providers={[]}
          />
        </CardContent>
      </Card>
    </main>
  );
}
