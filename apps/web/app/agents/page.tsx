"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@daemon/hooks";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatId } from "@/src/lib/format";

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
  const { session, isResolved } = useSession();

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
            <CardTitle>Agents</CardTitle>
            <CardDescription>请先登录再创建或查看 Agent。</CardDescription>
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
      title="Agent 工作台"
      description="管理你的长期助手实例。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/chat">打开聊天</Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">新建 Agent</CardTitle>
            <CardDescription>为不同任务创建独立助手实例。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="agent-name">Agent 名称</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Personal Ops Copilot"
              />
            </div>
            <Button
              onClick={() => createAgent.mutate({ name: name.trim() })}
              disabled={!name.trim() || createAgent.isPending}
            >
              {createAgent.isPending ? "创建中..." : "创建"}
            </Button>
          </CardContent>
          {createErrorMessage ? (
            <CardContent className="pt-0">
              <Alert variant="destructive">
                <AlertDescription>创建失败：{createErrorMessage}</AlertDescription>
              </Alert>
            </CardContent>
          ) : null}
        </Card>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Agent 列表</span>
            <Badge variant="secondary">{agents.data?.length ?? 0}</Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => agents.refetch()} disabled={agents.isFetching}>
            {agents.isFetching ? "刷新中..." : "刷新"}
          </Button>
        </div>

        {listErrorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{listErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3">
          {agents.isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <Card key={`agent-loading-${index}`}>
                  <CardContent>
                    <Skeleton className="h-14 w-full" />
                  </CardContent>
                </Card>
              ))
            : (agents.data ?? []).map((agent) => (
                <Card key={agent.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="font-medium">{agent.name}</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="cursor-default text-xs text-muted-foreground">
                            {formatId(agent.id)}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">{agent.id}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button asChild size="sm">
                        <Link href={`/chat/${agent.id}`}>聊天</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/usage?agent=${encodeURIComponent(agent.id)}`}>用量</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/memory?agent=${encodeURIComponent(agent.id)}`}>记忆</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {!agents.isLoading && !listErrorMessage && (agents.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              还没有 Agent，先创建第一个并进入聊天。
            </div>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}
