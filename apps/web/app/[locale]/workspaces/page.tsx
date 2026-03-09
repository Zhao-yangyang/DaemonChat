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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatTime } from "@/src/lib/format";

const ROLE_LABELS: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "成员",
  viewer: "查看者",
};

export default function WorkspacesPage() {
  const { session, isResolved } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");
  const [selectedWs, setSelectedWs] = useState<string | null>(null);

  const workspaces = trpc.workspace.list.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createWorkspace = trpc.workspace.create.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setWsName("");
      setWsSlug("");
      workspaces.refetch();
    },
  });

  const members = trpc.workspace.members.useQuery(
    { workspaceId: selectedWs ?? "" },
    { enabled: Boolean(selectedWs), retry: false }
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
            <CardTitle>团队空间</CardTitle>
            <CardDescription>请先登录再管理工作空间。</CardDescription>
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
      title="团队空间"
      description="管理你的工作空间与团队成员。"
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          新建空间
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        {workspaces.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {workspaces.error.message || "加载空间列表失败。"}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3">
          {workspaces.isLoading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Card key={`ws-loading-${i}`}>
                  <CardContent>
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))
            : (workspaces.data ?? []).map((ws: { id: string; name: string; slug: string; ownerUserId: string; role: string; createdAt: string }) => (
                <Card key={ws.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{ws.name}</p>
                          <Badge variant="secondary">{ROLE_LABELS[ws.role] ?? ws.role}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          /{ws.slug} · 创建于 {formatTime(ws.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedWs(ws.id === selectedWs ? null : ws.id)}
                      >
                        {ws.id === selectedWs ? "收起" : "成员"}
                      </Button>
                    </div>

                    {ws.id === selectedWs ? (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {members.isLoading ? (
                          <Skeleton className="h-10 w-full" />
                        ) : members.error ? (
                          <p className="text-sm text-destructive">加载成员失败</p>
                        ) : (
                          (members.data ?? []).map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="font-mono text-xs text-muted-foreground">
                                {m.user_id.slice(0, 8)}…
                              </span>
                              <Badge variant="outline">
                                {ROLE_LABELS[m.role] ?? m.role}
                              </Badge>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}

          {!workspaces.isLoading &&
            !workspaces.error &&
            (workspaces.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              还没有工作空间。创建一个以开始团队协作。
            </div>
          ) : null}
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>新建工作空间</DialogTitle>
              <DialogDescription>为团队创建一个新的协作空间。</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ws-name">空间名称</Label>
                <Input
                  id="ws-name"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="例如：产品团队"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ws-slug">标识符（slug）</Label>
                <Input
                  id="ws-slug"
                  value={wsSlug}
                  onChange={(e) =>
                    setWsSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-{2,}/g, "-")
                    )
                  }
                  placeholder="product-team"
                />
                <p className="text-xs text-muted-foreground">
                  仅允许小写字母、数字和连字符
                </p>
              </div>
              {createWorkspace.error ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {createWorkspace.error.message || "创建失败。"}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createWorkspace.isPending}
              >
                取消
              </Button>
              <Button
                onClick={() => {
                  if (wsName.trim() && wsSlug.trim()) {
                    createWorkspace.mutate({ name: wsName.trim(), slug: wsSlug.trim() });
                  }
                }}
                disabled={
                  !wsName.trim() || !wsSlug.trim() || createWorkspace.isPending
                }
              >
                {createWorkspace.isPending ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
