"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/src/i18n/navigation";
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
  Label,
  Skeleton,
  Textarea,
} from "@daemon/ui";
import { API_KEY_REDACTED, detectPresetFromConfig, CUSTOM_PROVIDER_ID } from "@daemon/domain";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { EMPTY_LLM_PROVIDER_STATE } from "@/src/components/llm-provider-section";

import { AgentCard } from "@/src/components/agents/agent-card";
import type { AgentCardAgent } from "@/src/components/agents/agent-card";
import { AgentConfigDialog } from "@/src/components/agents/agent-config-dialog";
import type { AgentConfigForm } from "@/src/components/agents/agent-config-dialog";
import { CreateAgentDialog } from "@/src/components/agents/create-agent-dialog";
import type { CreateAgentForm } from "@/src/components/agents/create-agent-dialog";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) {
      return maybe.message;
    }
  }
  return fallback;
};

const EMPTY_CONFIG_FORM: AgentConfigForm = {
  systemPrompt: "",
  memoryTopK: "8",
  recentMessages: "20",
  temperature: "0.7",
  visibility: "private",
  llmProvider: EMPTY_LLM_PROVIDER_STATE,
  apiKeyConfigured: false,
};

const EMPTY_CREATE_FORM: CreateAgentForm = {
  ...EMPTY_CONFIG_FORM,
  name: "",
  workspaceId: undefined,
};

export default function AgentsPage() {
  const t = useTranslations("agents");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAgentForm>(EMPTY_CREATE_FORM);
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<AgentConfigForm>(EMPTY_CONFIG_FORM);
  const [configFormError, setConfigFormError] = useState<string | null>(null);
  const router = useRouter();
  const { session, isResolved } = useSession();

  const agents = trpc.agent.list.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const workspaces = trpc.workspace.list.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const myTemplates = trpc.template.list.useQuery(
    { onlyMine: true, limit: 100 },
    { enabled: Boolean(session), retry: false, refetchOnWindowFocus: false },
  );
  const publishedAgentIds = useMemo(
    () =>
      new Set(
        (myTemplates.data ?? [])
          .map((t) => t.source_agent_id as string | undefined)
          .filter((id): id is string => Boolean(id)),
      ),
    [myTemplates.data],
  );

  const createAgent = trpc.agent.create.useMutation({
    onSuccess: (agent) => {
      setCreateDialogOpen(false);
      setCreateForm({ ...EMPTY_CONFIG_FORM, name: "", workspaceId: undefined });
      setCreateFormError(null);
      createAgent.reset();
      agents.refetch();
      router.push(`/chat/${agent.id}`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t("createError")));
    },
  });
  const updateAgent = trpc.agent.update.useMutation({
    onSuccess: () => {
      setEditingAgentId(null);
      setConfigForm(EMPTY_CONFIG_FORM);
      setConfigFormError(null);
      agents.refetch();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t("updateError")));
    },
  });
  const deleteAgent = trpc.agent.delete.useMutation({
    onSuccess: () => {
      setDeletingAgentId(null);
      agents.refetch();
    },
    onError: () => {
      toast.error(t("deleteError"));
    },
  });

  const [publishAgentId, setPublishAgentId] = useState<string | null>(null);
  const [publishDesc, setPublishDesc] = useState("");
  const [publishPublic, setPublishPublic] = useState(true);
  const publishTemplate = trpc.template.publish.useMutation({
    onSuccess: () => {
      setPublishAgentId(null);
      setPublishDesc("");
      myTemplates.refetch();
    },
  });

  const listErrorMessage = useMemo(
    () => (agents.error ? getErrorMessage(agents.error, t("listError")) : null),
    [agents.error, t],
  );

  const createErrorMessage = useMemo(
    () => (createAgent.error ? getErrorMessage(createAgent.error, t("createError")) : null),
    [createAgent.error, t],
  );
  const updateErrorMessage = useMemo(
    () => (updateAgent.error ? getErrorMessage(updateAgent.error, t("updateError")) : null),
    [updateAgent.error, t],
  );
  const deleteErrorMessage = useMemo(
    () => (deleteAgent.error ? getErrorMessage(deleteAgent.error, t("deleteError")) : null),
    [deleteAgent.error, t],
  );

  const selectedAgent = useMemo(
    () => (agents.data ?? []).find((agent) => agent.id === editingAgentId) ?? null,
    [agents.data, editingAgentId],
  );
  const deletingAgent = useMemo(
    () => (agents.data ?? []).find((agent) => agent.id === deletingAgentId) ?? null,
    [agents.data, deletingAgentId],
  );

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateFormError(null);
    createAgent.reset();
  };
  const closeConfigDialog = () => {
    setEditingAgentId(null);
    setConfigForm(EMPTY_CONFIG_FORM);
    setConfigFormError(null);
    updateAgent.reset();
  };
  const closeDeleteDialog = () => {
    setDeletingAgentId(null);
    deleteAgent.reset();
  };

  const openConfigDialog = (agent: AgentCardAgent) => {
    setEditingAgentId(agent.id);

    const detected = detectPresetFromConfig({
      baseURL: agent.config.llmProvider?.baseURL,
      model: agent.config.llmProvider?.model,
    });

    const rawApiKey = agent.config.llmProvider?.apiKey ?? "";
    const isRedacted = rawApiKey === API_KEY_REDACTED;

    setConfigForm({
      systemPrompt: agent.config.systemPrompt ?? "",
      memoryTopK: String(agent.config.memoryTopK ?? 8),
      recentMessages: String(agent.config.recentMessages ?? 20),
      temperature: String(agent.config.temperature ?? 0.7),
      visibility: agent.visibility ?? "private",
      llmProvider: {
        presetId:
          agent.config.llmProvider?.presetId ??
          detected?.providerId ??
          (agent.config.llmProvider?.baseURL ? CUSTOM_PROVIDER_ID : ""),
        model: agent.config.llmProvider?.model ?? "",
        baseURL: agent.config.llmProvider?.baseURL ?? "",
        apiKey: isRedacted ? "" : rawApiKey,
        sdkProvider: agent.config.llmProvider?.sdkProvider ?? "openai",
      },
      apiKeyConfigured: isRedacted,
    });
    setConfigFormError(null);
    updateAgent.reset();
  };

  const saveConfig = () => {
    if (!editingAgentId) return;
    setConfigFormError(null);

    const memoryTopK = Number(configForm.memoryTopK);
    const recentMessages = Number(configForm.recentMessages);
    const temperature = Number(configForm.temperature);

    if (!Number.isInteger(memoryTopK) || memoryTopK < 1 || memoryTopK > 50) {
      setConfigFormError(t("validateMemoryTopK"));
      return;
    }
    if (!Number.isInteger(recentMessages) || recentMessages < 1 || recentMessages > 100) {
      setConfigFormError(t("validateRecentMessages"));
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setConfigFormError(t("validateTemperature"));
      return;
    }

    const lp = configForm.llmProvider;
    const apiKeyToSend = lp.apiKey || (configForm.apiKeyConfigured ? API_KEY_REDACTED : "");
    const hasProvider = lp.baseURL && lp.model && (lp.apiKey || configForm.apiKeyConfigured);

    updateAgent.mutate({
      agentId: editingAgentId,
      visibility: configForm.visibility,
      config: {
        systemPrompt: configForm.systemPrompt,
        memoryTopK,
        recentMessages,
        temperature,
        ...(hasProvider
          ? {
              llmProvider: {
                baseURL: lp.baseURL,
                model: lp.model.trim(),
                apiKey: apiKeyToSend,
                presetId: lp.presetId || undefined,
                sdkProvider: lp.sdkProvider,
              },
            }
          : {}),
      },
    });
  };

  const doCreateAgent = () => {
    setCreateFormError(null);
    const trimmedName = createForm.name.trim();
    if (!trimmedName) {
      setCreateFormError(t("validateName"));
      return;
    }

    const memoryTopK = Number(createForm.memoryTopK);
    const recentMessages = Number(createForm.recentMessages);
    const temperature = Number(createForm.temperature);

    if (!Number.isInteger(memoryTopK) || memoryTopK < 1 || memoryTopK > 50) {
      setCreateFormError(t("validateMemoryTopK"));
      return;
    }
    if (!Number.isInteger(recentMessages) || recentMessages < 1 || recentMessages > 100) {
      setCreateFormError(t("validateRecentMessages"));
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setCreateFormError(t("validateTemperature"));
      return;
    }

    const lp = createForm.llmProvider;
    const hasProvider = lp.baseURL && lp.model && (lp.apiKey || createForm.apiKeyConfigured);

    createAgent.mutate({
      name: trimmedName,
      ...(createForm.workspaceId ? { workspaceId: createForm.workspaceId } : {}),
      config: {
        ...(createForm.systemPrompt.trim() && { systemPrompt: createForm.systemPrompt.trim() }),
        memoryTopK,
        recentMessages,
        temperature,
        ...(hasProvider
          ? {
              llmProvider: {
                baseURL: lp.baseURL,
                model: lp.model.trim(),
                apiKey: lp.apiKey || (createForm.apiKeyConfigured ? API_KEY_REDACTED : ""),
                presetId: lp.presetId || undefined,
                sdkProvider: lp.sdkProvider,
              },
            }
          : {}),
      },
    });
  };

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

  return (
    <DashboardShell
      title={t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)} data-testid="agents-create">
            {t("create")}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/templates">{t("templatesNav")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/chat">{t("openChat")}</Link>
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("listLabel")}</span>
            <Badge variant="secondary">{agents.data?.length ?? 0}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => agents.refetch()}
            disabled={agents.isFetching}
          >
            {agents.isFetching ? t("refreshing") : t("refresh")}
          </Button>
        </div>

        {listErrorMessage ? (
          <Alert variant="destructive">
            <AlertDescription>{listErrorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3" data-testid="agents-list">
          {agents.isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <Card key={`agent-loading-${index}`}>
                  <CardContent>
                    <Skeleton className="h-14 w-full" />
                  </CardContent>
                </Card>
              ))
            : (agents.data ?? []).map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isPublished={publishedAgentIds.has(agent.id)}
                  isDeletePending={deleteAgent.isPending}
                  onConfigOpen={openConfigDialog}
                  onDeleteOpen={setDeletingAgentId}
                  onPublishOpen={(id) => {
                    setPublishAgentId(id);
                    setPublishDesc("");
                    setPublishPublic(true);
                    publishTemplate.reset();
                  }}
                />
              ))}

          {!agents.isLoading && !listErrorMessage && (agents.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">{t("emptyHint")}</p>
              <Button onClick={() => setCreateDialogOpen(true)}>{t("create")}</Button>
            </div>
          ) : null}
        </div>

        {/* Create Agent Dialog */}
        <CreateAgentDialog
          open={createDialogOpen}
          form={createForm}
          formError={createFormError}
          mutationError={createErrorMessage}
          isPending={createAgent.isPending}
          workspaces={(workspaces.data ?? []).map((ws: { id: string; name: string }) => ws)}
          onFormChange={setCreateForm}
          onCreate={doCreateAgent}
          onClose={closeCreateDialog}
        />

        {/* Agent Config Dialog */}
        <AgentConfigDialog
          open={Boolean(editingAgentId)}
          agentId={editingAgentId}
          agentName={selectedAgent?.name}
          form={configForm}
          formError={configFormError ?? updateErrorMessage ?? null}
          isPending={updateAgent.isPending}
          onFormChange={setConfigForm}
          onSave={saveConfig}
          onClose={closeConfigDialog}
        />

        {/* ——— Keep the remaining dialogs (delete + publish) ——— */}
        {/* Delete Confirmation Dialog */}
        <Dialog
          open={Boolean(deletingAgentId)}
          onOpenChange={(open) => (!open ? closeDeleteDialog() : undefined)}
        >
          <DialogContent className="sm:max-w-md" data-testid="agent-delete-dialog">
            <DialogHeader>
              <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
              <DialogDescription>
                {deletingAgent
                  ? t("deleteDialogConfirm", { name: deletingAgent.name })
                  : t("deleteDialogConfirmDefault")}
              </DialogDescription>
            </DialogHeader>
            {deleteErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{deleteErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={closeDeleteDialog}
                disabled={deleteAgent.isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deleteAgent.isPending || !deletingAgentId}
                data-testid="agent-delete-confirm"
                onClick={() => {
                  if (!deletingAgentId) return;
                  deleteAgent.mutate({ agentId: deletingAgentId });
                }}
              >
                {deleteAgent.isPending ? t("deleting") : t("confirmDelete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Publish Template Dialog */}
        <Dialog
          open={Boolean(publishAgentId)}
          onOpenChange={(open) => {
            if (!open) {
              setPublishAgentId(null);
              publishTemplate.reset();
            }
          }}
        >
          <DialogContent className="sm:max-w-md" data-testid="agent-publish-dialog">
            <DialogHeader>
              <DialogTitle>
                {publishAgentId && publishedAgentIds.has(publishAgentId)
                  ? t("updateTemplateDialogTitle")
                  : t("publishDialogTitle")}
              </DialogTitle>
              <DialogDescription>
                {publishAgentId && publishedAgentIds.has(publishAgentId)
                  ? t("updateTemplateDialogDesc")
                  : t("publishDialogDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="publish-desc">{t("publishDescLabel")}</Label>
                <Textarea
                  id="publish-desc"
                  rows={3}
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  placeholder={t("publishDescPlaceholder")}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publishPublic}
                  onChange={(e) => setPublishPublic(e.target.checked)}
                  className="rounded"
                />
                {t("publishPublic")}
              </label>
              {publishTemplate.error ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {getErrorMessage(publishTemplate.error, t("publishError"))}
                  </AlertDescription>
                </Alert>
              ) : null}
              {publishTemplate.isSuccess ? (
                <Alert>
                  <AlertDescription>{t("publishSuccess")}</AlertDescription>
                </Alert>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setPublishAgentId(null);
                  publishTemplate.reset();
                }}
                disabled={publishTemplate.isPending}
              >
                {t("cancel")}
              </Button>
              <Button
                data-testid="agent-publish-confirm"
                onClick={() => {
                  if (!publishAgentId) return;
                  publishTemplate.mutate({
                    agentId: publishAgentId,
                    description: publishDesc,
                    isPublic: publishPublic,
                  });
                }}
                disabled={publishTemplate.isPending || !publishAgentId || publishTemplate.isSuccess}
              >
                {publishTemplate.isPending
                  ? t("publishSubmitting")
                  : publishAgentId && publishedAgentIds.has(publishAgentId)
                    ? t("confirmUpdate")
                    : t("confirmPublish")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
