"use client";

import Link from "next/link";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@daemon/ui";
import { ChatEntryGate } from "@/src/components/chat-entry-gate";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";

export default function ChatIndexPage() {
  const { session, isResolved } = useSession();

  if (!isResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardDescription>正在检查登录状态...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">请先登录</CardTitle>
            <CardDescription>登录后会自动进入最近聊天会话。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-fit">
              <Link href="/">返回登录页</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell
      title="Chat"
      description="正在为你打开最近会话。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/agents">管理 Agents</Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <ChatEntryGate />
      </div>
    </DashboardShell>
  );
}
