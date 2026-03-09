"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@daemon/ui";
import { API_KEY_REDACTED, detectPresetFromConfig, CUSTOM_PROVIDER_ID } from "@daemon/domain";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatId } from "@/src/lib/format";
import { ProviderIcon } from "@/src/components/provider-icon";
import {
  LlmProviderSection,
  EMPTY_LLM_PROVIDER_STATE,
} from "@/src/components/llm-provider-section";
import type { LlmProviderFormState } from "@/src/components/llm-provider-section";

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string" && maybe.message.trim()) {
      return maybe.message;
    }
  }
  return fallback;
};

type AgentVisibility = "private" | "workspace" | "public";

type AgentConfigForm = {
  systemPrompt: string;
  memoryTopK: string;
  recentMessages: string;
  temperature: string;
  visibility: AgentVisibility;
  llmProvider: LlmProviderFormState;
  /** 打开对话框时 API Key 已配置（后端返回 REDACTED），保存时空字符串应发回 REDACTED 以保留 */
  apiKeyConfigured: boolean;
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

export default function AgentsPage() {
  const t = useTranslations("agents");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<AgentConfigForm & { name: string; workspaceId?: string }>({
    ...EMPTY_CONFIG_FORM,
    name: "",
    workspaceId: undefined,
  });
  const [createFormError, setCreateFormError] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<AgentConfigForm>(EMPTY_CONFIG_FORM);
  const [configFormError, setConfigFormError] = useState<string | null>(null);
  const router = useRouter();
  const locale = useLocale();
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
    { enabled: Boolean(session), retry: false, refetchOnWindowFocus: false }
  );
  const publishedAgentIds = useMemo(
    () =>
      new Set(
        (myTemplates.data ?? [])
          .map((t) => t.source_agent_id as string | undefined)
          .filter((id): id is string => Boolean(id))
      ),
    [myTemplates.data]
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
    () =>
      agents.error
        ? getErrorMessage(agents.error, t("listError"))
        : null,
    [agents.error, t]
  );

  const createErrorMessage = useMemo(
    () =>
      createAgent.error
        ? getErrorMessage(createAgent.error, t("createError"))
        : null,
    [createAgent.error, t]
  );
  const updateErrorMessage = useMemo(
    () =>
      updateAgent.error
        ? getErrorMessage(updateAgent.error, t("updateError"))
        : null,
    [updateAgent.error, t]
  );
  const deleteErrorMessage = useMemo(
    () =>
      deleteAgent.error
        ? getErrorMessage(deleteAgent.error, t("deleteError"))
        : null,
    [deleteAgent.error, t]
  );

  const selectedAgent = useMemo(
    () => (agents.data ?? []).find((agent) => agent.id === editingAgentId) ?? null,
    [agents.data, editingAgentId]
  );
  const deletingAgent = useMemo(
    () => (agents.data ?? []).find((agent) => agent.id === deletingAgentId) ?? null,
    [agents.data, deletingAgentId]
  );

  const closeCreateDialog = () => {
    setCreateDialogOpen(false);
    setCreateForm({ ...EMPTY_CONFIG_FORM, name: "", workspaceId: undefined });
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

  const openConfigDialog = (agent: {
    id: string;
    visibility?: AgentVisibility;
    config: {
      systemPrompt: string;
      memoryTopK: number;
      recentMessages: number;
      temperature: number;
      llmProvider?: {
        model?: string;
        baseURL?: string;
        apiKey?: string;
        presetId?: string;
        sdkProvider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
      } | null;
    };
  }) => {
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
        presetId: agent.config.llmProvider?.presetId
          ?? detected?.providerId
          ?? (agent.config.llmProvider?.baseURL ? CUSTOM_PROVIDER_ID : ""),
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
    const apiKeyToSend =
      lp.apiKey || (configForm.apiKeyConfigured ? API_KEY_REDACTED : "");
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
          <Button variant="ghost" size="sm" onClick={() => agents.refetch()} disabled={agents.isFetching}>
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
                <Card key={agent.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-2 flex-wrap">
                        {agent.name}
                        {publishedAgentIds.has(agent.id) ? (
                          <Badge variant="secondary" className="text-xs">{t("published")}</Badge>
                        ) : null}
                        <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50">
                          <ProviderIcon
                            providerId={
                              agent.config.llmProvider?.presetId && agent.config.llmProvider.presetId !== "__custom__"
                                ? agent.config.llmProvider.presetId
                                : agent.config.llmProvider?.sdkProvider ?? ""
                            }
                            size={14}
                          />
                          {agent.config.llmProvider?.model || t("notConfigured")}
                        </span>
                      </p>
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
                        <Link href={`/chat/${agent.id}`}>{t("chat")}</Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openConfigDialog(agent)}>
                        {t("config")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingAgentId(agent.id)}
                        disabled={deleteAgent.isPending}
                      >
                        {t("delete")}
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/usage?agent=${encodeURIComponent(agent.id)}`}>{t("usage")}</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/memory?agent=${encodeURIComponent(agent.id)}`}>{t("memory")}</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPublishAgentId(agent.id);
                          setPublishDesc("");
                          setPublishPublic(true);
                          publishTemplate.reset();
                        }}
                      >
                        {publishedAgentIds.has(agent.id) ? t("updatePublish") : t("publish")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {!agents.isLoading && !listErrorMessage && (agents.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">{t("emptyHint")}</p>
              <Button onClick={() => setCreateDialogOpen(true)}>{t("create")}</Button>
            </div>
          ) : null}
        </div>

        {/* Create Agent Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={(open) => (!open ? closeCreateDialog() : undefined)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createDialogTitle")}</DialogTitle>
              <DialogDescription>{t("createDialogDesc")}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="create-agent-name">{t("agentNameLabel")}</Label>
                <Input
                  id="create-agent-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={t("agentNamePlaceholder")}
                />
              </div>

              {(workspaces.data ?? []).length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="create-agent-workspace">{t("workspaceLabel")}</Label>
                  <Select
                    value={createForm.workspaceId ?? ""}
                    onValueChange={(v) =>
                      setCreateForm((prev) => ({ ...prev, workspaceId: v || undefined }))
                    }
                  >
                    <SelectTrigger id="create-agent-workspace">
                      <SelectValue placeholder={t("workspacePersonalPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t("workspacePersonal")}</SelectItem>
                      {(workspaces.data ?? []).map((ws: { id: string; name: string }) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          {ws.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="create-agent-system-prompt">{t("systemPromptLabel")}</Label>
                <Textarea
                  id="create-agent-system-prompt"
                  rows={4}
                  value={createForm.systemPrompt}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder={t("systemPromptPlaceholder")}
                />
              </div>

              <LlmProviderSection
                value={createForm.llmProvider}
                onChange={(lp) => setCreateForm((prev) => ({ ...prev, llmProvider: lp }))}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="create-agent-memory-topk">{t("memoryTopKLabel")}</Label>
                  <Input
                    id="create-agent-memory-topk"
                    type="number"
                    min={1}
                    max={50}
                    value={createForm.memoryTopK}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, memoryTopK: e.target.value }))}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="create-agent-recent-messages">{t("recentMessagesLabel")}</Label>
                  <Input
                    id="create-agent-recent-messages"
                    type="number"
                    min={1}
                    max={100}
                    value={createForm.recentMessages}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, recentMessages: e.target.value }))}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="create-agent-temperature">{t("temperatureLabel")}</Label>
                  <Input
                    id="create-agent-temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={createForm.temperature}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, temperature: e.target.value }))}
                  />
                </div>
              </div>

              {createFormError ? (
                <Alert variant="destructive">
                  <AlertDescription>{createFormError}</AlertDescription>
                </Alert>
              ) : null}
              {createErrorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{createErrorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeCreateDialog} disabled={createAgent.isPending}>
                {t("cancel")}
              </Button>
              <Button onClick={doCreateAgent} disabled={createAgent.isPending}>
                {createAgent.isPending ? t("creating") : t("createAndChat")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agent Config Dialog */}
        <Dialog open={Boolean(editingAgentId)} onOpenChange={(open) => (!open ? closeConfigDialog() : undefined)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("configDialogTitle")}</DialogTitle>
              <DialogDescription>
                {selectedAgent ? t("configDialogDescEditing", { name: selectedAgent.name }) : t("configDialogDescDefault")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="agent-system-prompt">{t("systemPromptLabel")}</Label>
                <Textarea
                  id="agent-system-prompt"
                  rows={4}
                  value={configForm.systemPrompt}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder={t("systemPromptPlaceholder")}
                />
              </div>

              <LlmProviderSection
                value={configForm.llmProvider}
                onChange={(lp) => setConfigForm((prev) => ({ ...prev, llmProvider: lp }))}
                apiKeyPlaceholder={
                  configForm.apiKeyConfigured ? t("apiKeyPlaceholder") : undefined
                }
              />

              <div className="grid gap-1.5">
                <Label>可见性</Label>
                <div className="flex gap-2">
                  <Select
                    value={configForm.visibility}
                    onValueChange={(v) =>
                      setConfigForm((prev) => ({ ...prev, visibility: v as AgentVisibility }))
                    }
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">{t("visibilityPrivate")}</SelectItem>
                      <SelectItem value="workspace">{t("visibilityWorkspace")}</SelectItem>
                      <SelectItem value="public">{t("visibilityPublic")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {configForm.visibility === "public" && editingAgentId ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const url = `${typeof window !== "undefined" ? window.location.origin : ""}/${locale}/share/${editingAgentId}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success(t("shareLinkCopied"));
                        } catch {
                          toast.error(t("copyFailed"));
                        }
                      }}
                    >
                      {t("copyShareLink")}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="agent-memory-topk">{t("memoryTopKLabel")}</Label>
                  <Input
                    id="agent-memory-topk"
                    type="number"
                    min={1}
                    max={50}
                    value={configForm.memoryTopK}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, memoryTopK: e.target.value }))}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="agent-recent-messages">{t("recentMessagesLabel")}</Label>
                  <Input
                    id="agent-recent-messages"
                    type="number"
                    min={1}
                    max={100}
                    value={configForm.recentMessages}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, recentMessages: e.target.value }))}
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="agent-temperature">{t("temperatureLabel")}</Label>
                  <Input
                    id="agent-temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={configForm.temperature}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, temperature: e.target.value }))}
                  />
                </div>
              </div>

              {configFormError ? (
                <Alert variant="destructive">
                  <AlertDescription>{configFormError}</AlertDescription>
                </Alert>
              ) : null}
              {updateErrorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{updateErrorMessage}</AlertDescription>
                </Alert>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeConfigDialog} disabled={updateAgent.isPending}>
                {t("cancel")}
              </Button>
              <Button onClick={saveConfig} disabled={updateAgent.isPending || !editingAgentId}>
                {updateAgent.isPending ? t("saving") : t("saveConfig")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={Boolean(deletingAgentId)} onOpenChange={(open) => (!open ? closeDeleteDialog() : undefined)}>
          <DialogContent className="sm:max-w-md">
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
              <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteAgent.isPending}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deleteAgent.isPending || !deletingAgentId}
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
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{publishAgentId && publishedAgentIds.has(publishAgentId) ? t("updateTemplateDialogTitle") : t("publishDialogTitle")}</DialogTitle>
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
