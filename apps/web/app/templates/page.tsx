"use client";

import { useState } from "react";
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
  Skeleton,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatTime } from "@/src/lib/format";

export default function TemplatesPage() {
  const { session, isResolved } = useSession();
  const [onlyMine, setOnlyMine] = useState(false);

  const templates = trpc.template.list.useQuery(
    { onlyMine, limit: 50 },
    { enabled: Boolean(session), retry: false, refetchOnWindowFocus: false }
  );

  const cloneTemplate = trpc.template.clone.useMutation();

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
            <CardTitle>模板市场</CardTitle>
            <CardDescription>请先登录再浏览模板。</CardDescription>
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
      title="模板市场"
      description="浏览和克隆社区分享的 Agent 模板。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/agents">返回 Agent 列表</Link>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={onlyMine ? "outline" : "default"}
              size="sm"
              onClick={() => setOnlyMine(false)}
            >
              全部模板
            </Button>
            <Button
              variant={onlyMine ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyMine(true)}
            >
              我的模板
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => templates.refetch()}
            disabled={templates.isFetching}
          >
            {templates.isFetching ? "刷新中..." : "刷新"}
          </Button>
        </div>

        {templates.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {templates.error.message || "加载模板列表失败，请稍后重试。"}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3">
          {templates.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={`tpl-loading-${i}`}>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))
            : (templates.data ?? []).map((tpl) => (
                <Card key={tpl.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{tpl.name}</p>
                          {tpl.is_public ? (
                            <Badge variant="secondary">公开</Badge>
                          ) : (
                            <Badge variant="outline">私有</Badge>
                          )}
                        </div>
                        {tpl.description ? (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {tpl.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>克隆 {tpl.clone_count} 次</span>
                          <span>{formatTime(tpl.created_at)}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => cloneTemplate.mutate({ templateId: tpl.id })}
                        disabled={cloneTemplate.isPending}
                      >
                        {cloneTemplate.isPending ? "克隆中..." : "克隆使用"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {!templates.isLoading && !templates.error && (templates.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {onlyMine
                ? "你还没有发布过模板。前往 Agent 列表，点击「发布」将 Agent 分享为模板。"
                : "暂无模板。成为第一个分享 Agent 配置的人！"}
            </div>
          ) : null}
        </div>

        {cloneTemplate.isSuccess ? (
          <Alert>
            <AlertDescription>
              Agent 已克隆成功！
              <Link
                href={`/chat/${cloneTemplate.data.agentId}`}
                className="ml-2 underline"
              >
                前往聊天
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {cloneTemplate.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {cloneTemplate.error.message || "克隆失败，请稍后重试。"}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </DashboardShell>
  );
}
