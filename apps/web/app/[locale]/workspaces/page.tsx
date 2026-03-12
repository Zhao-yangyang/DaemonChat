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
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@daemon/ui";
import { Trash2, UserPlus, X } from "lucide-react";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatId, formatTime } from "@/src/lib/format";
import { WorkspaceCreateDialog } from "@/src/components/workspaces/workspace-create-dialog";
import { WorkspaceInviteDialog } from "@/src/components/workspaces/workspace-invite-dialog";
import {
  WorkspaceDeleteDialog,
  WorkspaceRemoveDialog,
} from "@/src/components/workspaces/workspace-confirm-dialogs";

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

  // — Delete workspace dialog state —
  const [deleteWsId, setDeleteWsId] = useState<string | null>(null);
  const [deleteWsName, setDeleteWsName] = useState("");

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

  const deleteWorkspace = trpc.workspace.delete.useMutation({
    onSuccess: () => {
      setDeleteWsId(null);
      setDeleteWsName("");
      if (selectedWs?.id === deleteWsId) setSelectedWs(null);
      workspaces.refetch();
      toast.success(t("deleteSuccess"));
    },
    onError: (err) => {
      toast.error(err.message || t("deleteError"));
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
        <Button size="sm" onClick={() => setCreateOpen(true)} data-testid="workspace-create-btn">
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
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setSelectedWs(isSelected ? null : { id: ws.id, role: ws.role })
                            }
                          >
                            {isSelected ? t("collapse") : t("members")}
                          </Button>
                          {ws.role === "owner" ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              title={t("deleteWorkspace")}
                              onClick={() => {
                                setDeleteWsId(ws.id);
                                setDeleteWsName(ws.name);
                              }}
                            >
                              <Trash2 className="size-4" />
                              <span className="sr-only">{t("deleteWorkspace")}</span>
                            </Button>
                          ) : null}
                        </div>
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
                                          {formatId(m.user_id)}
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

        <WorkspaceCreateDialog
          open={createOpen}
          name={wsName}
          slug={wsSlug}
          isPending={createWorkspace.isPending}
          error={createWorkspace.error?.message ?? null}
          onNameChange={setWsName}
          onSlugChange={setWsSlug}
          onClose={() => setCreateOpen(false)}
          onSubmit={() => {
            if (wsName.trim() && wsSlug.trim()) {
              createWorkspace.mutate({ name: wsName.trim(), slug: wsSlug.trim() });
            }
          }}
        />

        <WorkspaceInviteDialog
          open={inviteOpen}
          userId={inviteUserId}
          role={inviteRole}
          isPending={inviteMember.isPending}
          onUserIdChange={setInviteUserId}
          onRoleChange={setInviteRole}
          onClose={() => {
            setInviteOpen(false);
            setInviteUserId("");
            setInviteRole("member");
          }}
          onSubmit={() => {
            if (!inviteUserId || !selectedWs?.id) return;
            inviteMember.mutate({
              workspaceId: selectedWs.id,
              userId: inviteUserId,
              role: inviteRole,
            });
          }}
        />

        <WorkspaceDeleteDialog
          open={Boolean(deleteWsId)}
          workspaceName={deleteWsName}
          isPending={deleteWorkspace.isPending}
          onClose={() => {
            setDeleteWsId(null);
            setDeleteWsName("");
          }}
          onConfirm={() => {
            if (!deleteWsId) return;
            deleteWorkspace.mutate({ workspaceId: deleteWsId });
          }}
        />

        <WorkspaceRemoveDialog
          open={Boolean(removeMemberId)}
          isPending={removeMember.isPending}
          onClose={() => setRemoveMemberId(null)}
          onConfirm={() => {
            if (!removeMemberId || !selectedWs?.id) return;
            removeMember.mutate({
              workspaceId: selectedWs.id,
              memberId: removeMemberId,
            });
          }}
        />
      </div>
    </DashboardShell>
  );
}
