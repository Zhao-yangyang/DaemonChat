"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@daemon/ui";
import { UserPlus, X } from "lucide-react";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatTime } from "@/src/lib/format";

type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

const CAN_MANAGE: WorkspaceRole[] = ["owner", "admin"];

function canManage(role: string): boolean {
  return CAN_MANAGE.includes(role as WorkspaceRole);
}

export default function WorkspacesPage() {
  const t = useTranslations("workspaces");
  const { session, isResolved } = useSession();

  // — Create workspace dialog state —
  const [createOpen, setCreateOpen] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsSlug, setWsSlug] = useState("");

  // — Selected workspace for members panel —
  const [selectedWs, setSelectedWs] = useState<{
    id: string;
    role: string;
  } | null>(null);

  // — Invite member dialog state —
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");

  // — Remove member dialog state —
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  // ——— tRPC queries / mutations ———
  const workspaces = trpc.workspace.list.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const members = trpc.workspace.members.useQuery(
    { workspaceId: selectedWs?.id ?? "" },
    { enabled: Boolean(selectedWs?.id), retry: false },
  );

  const createWorkspace = trpc.workspace.create.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setWsName("");
      setWsSlug("");
      workspaces.refetch();
    },
  });

  const inviteMember = trpc.workspace.invite.useMutation({
    onSuccess: () => {
      setInviteOpen(false);
      setInviteUserId("");
      setInviteRole("member");
      members.refetch();
      toast.success(t("inviteSuccess"));
    },
    onError: (err) => {
      toast.error(err.message || t("inviteError"));
    },
  });

  const removeMember = trpc.workspace.removeMember.useMutation({
    onSuccess: () => {
      setRemoveMemberId(null);
      members.refetch();
      toast.success(t("removeSuccess"));
    },
    onError: (err) => {
      toast.error(err.message || t("removeError"));
    },
  });

  // ——— Auth gates ———
  if (!isResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardDescription>{t("checkingAuth")}</CardDescription>
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
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("loginRequired")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-fit">
              <Link href="/">{t("backToLogin")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    owner: t("roleOwner"),
    admin: t("roleAdmin"),
    member: t("roleMember"),
    viewer: t("roleViewer"),
  };

  return (
    <DashboardShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          {t("create")}
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        {/* Error banner */}
        {workspaces.error ? (
          <Alert variant="destructive">
            <AlertDescription>{workspaces.error.message || t("listError")}</AlertDescription>
          </Alert>
        ) : null}

        {/* Workspace list */}
        <div className="space-y-3">
          {workspaces.isLoading
            ? Array.from({ length: 2 }).map((_, i) => (
                <Card key={`ws-loading-${i}`}>
                  <CardContent className="py-4">
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))
            : (workspaces.data ?? []).map((ws) => {
                const isSelected = selectedWs?.id === ws.id;
                return (
                  <Card key={ws.id} className="transition-shadow hover:shadow-md">
                    <CardContent className="py-4">
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{ws.name}</p>
                            <Badge variant="secondary">{roleLabels[ws.role] ?? ws.role}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            /{ws.slug} · {t("createdAt")} {formatTime(ws.createdAt)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSelectedWs(isSelected ? null : { id: ws.id, role: ws.role })
                          }
                        >
                          {isSelected ? t("collapse") : t("members")}
                        </Button>
                      </div>

                      {/* Members panel */}
                      {isSelected ? (
                        <div className="mt-4 space-y-3 border-t pt-4">
                          {/* Invite button for owner/admin */}
                          {canManage(ws.role) ? (
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setInviteOpen(true);
                                }}
                              >
                                <UserPlus className="mr-1.5 size-4" />
                                {t("inviteMember")}
                              </Button>
                            </div>
                          ) : null}

                          {/* Member rows */}
                          {members.isLoading ? (
                            <div className="space-y-2">
                              {Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                              ))}
                            </div>
                          ) : members.error ? (
                            <p className="text-sm text-destructive">{t("loadMembersError")}</p>
                          ) : (members.data ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("empty")}</p>
                          ) : (
                            <div className="space-y-2">
                              {(members.data ?? []).map((m) => (
                                <div
                                  key={m.id}
                                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                                >
                                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default truncate font-mono text-xs text-foreground">
                                          {m.user_id}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="font-mono text-xs">
                                          {t("memberIdTooltip", { id: m.user_id })}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                    <span className="text-xs text-muted-foreground">
                                      {t("memberJoinedAt", { date: formatTime(m.created_at) })}
                                    </span>
                                  </div>
                                  <div className="ml-3 flex shrink-0 items-center gap-2">
                                    <Badge variant="outline">{roleLabels[m.role] ?? m.role}</Badge>
                                    {/* Remove button: owner/admin only, can't remove another owner */}
                                    {canManage(ws.role) && m.role !== "owner" ? (
                                      <Button
                                        size="icon-sm"
                                        variant="ghost"
                                        className="size-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => setRemoveMemberId(m.id)}
                                        title={t("removeMember")}
                                      >
                                        <X className="size-3.5" />
                                        <span className="sr-only">{t("removeMember")}</span>
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}

          {!workspaces.isLoading && !workspaces.error && (workspaces.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("emptyHint")}
            </div>
          ) : null}
        </div>

        {/* ——— Create workspace dialog ——— */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("createDialogTitle")}</DialogTitle>
              <DialogDescription>{t("createDialogDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="ws-name">{t("nameLabel")}</Label>
                <Input
                  id="ws-name"
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder={t("namePlaceholder")}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ws-slug">{t("slugLabel")}</Label>
                <Input
                  id="ws-slug"
                  value={wsSlug}
                  onChange={(e) =>
                    setWsSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-")
                        .replace(/-{2,}/g, "-"),
                    )
                  }
                  placeholder="product-team"
                />
                <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
              </div>
              {createWorkspace.error ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {createWorkspace.error.message || t("createError")}
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
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (wsName.trim() && wsSlug.trim()) {
                    createWorkspace.mutate({ name: wsName.trim(), slug: wsSlug.trim() });
                  }
                }}
                disabled={!wsName.trim() || !wsSlug.trim() || createWorkspace.isPending}
              >
                {createWorkspace.isPending ? t("creating") : t("createBtn")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ——— Invite member dialog ——— */}
        <Dialog
          open={inviteOpen}
          onOpenChange={(open) => {
            if (!open) {
              setInviteOpen(false);
              setInviteUserId("");
              setInviteRole("member");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("inviteDialogTitle")}</DialogTitle>
              <DialogDescription>{t("inviteDialogDesc")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="invite-user-id">{t("userIdLabel")}</Label>
                <Input
                  id="invite-user-id"
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value.trim())}
                  placeholder={t("userIdPlaceholder")}
                  autoFocus
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="invite-role">{t("roleLabel")}</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) => setInviteRole(v as "admin" | "member" | "viewer")}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                    <SelectItem value="member">{t("roleMember")}</SelectItem>
                    <SelectItem value="viewer">{t("roleViewer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteUserId("");
                  setInviteRole("member");
                }}
                disabled={inviteMember.isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  if (!inviteUserId || !selectedWs?.id) return;
                  inviteMember.mutate({
                    workspaceId: selectedWs.id,
                    userId: inviteUserId,
                    role: inviteRole,
                  });
                }}
                disabled={!inviteUserId.trim() || inviteMember.isPending}
              >
                {inviteMember.isPending ? t("inviting") : t("invite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ——— Remove member confirm dialog ——— */}
        <Dialog
          open={Boolean(removeMemberId)}
          onOpenChange={(open) => {
            if (!open) setRemoveMemberId(null);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("removeDialogTitle")}</DialogTitle>
              <DialogDescription>{t("removeDialogDesc")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRemoveMemberId(null)}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={removeMember.isPending}
                onClick={() => {
                  if (!removeMemberId || !selectedWs?.id) return;
                  removeMember.mutate({
                    workspaceId: selectedWs.id,
                    memberId: removeMemberId,
                  });
                }}
              >
                {removeMember.isPending ? t("removing") : t("remove")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
