"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type AgentConfigForm = {
  systemPrompt: string;
  memoryTopK: string;
  recentMessages: string;
  temperature: string;
  llmProvider: LlmProviderFormState;
  /** 打开对话框时 API Key 已配置（后端返回 REDACTED），保存时空字符串应发回 REDACTED 以保留 */
  apiKeyConfigured: boolean;
};

const EMPTY_CONFIG_FORM: AgentConfigForm = {
  systemPrompt: "",
  memoryTopK: "8",
  recentMessages: "20",
  temperature: "0.7",
  llmProvider: EMPTY_LLM_PROVIDER_STATE,
  apiKeyConfigured: false,
};

export default function AgentsPage() {
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
  });
  const updateAgent = trpc.agent.update.useMutation({
    onSuccess: () => {
      setEditingAgentId(null);
      setConfigForm(EMPTY_CONFIG_FORM);
      setConfigFormError(null);
      agents.refetch();
    },
  });
  const deleteAgent = trpc.agent.delete.useMutation({
    onSuccess: () => {
      setDeletingAgentId(null);
      agents.refetch();
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
  const updateErrorMessage = useMemo(
    () =>
      updateAgent.error
        ? getErrorMessage(updateAgent.error, "保存 Agent 配置失败，请稍后重试。")
        : null,
    [updateAgent.error]
  );
  const deleteErrorMessage = useMemo(
    () =>
      deleteAgent.error
        ? getErrorMessage(deleteAgent.error, "删除 Agent 失败，请稍后重试。")
        : null,
    [deleteAgent.error]
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
      setConfigFormError("Memory TopK 需为 1-50 的整数。");
      return;
    }
    if (!Number.isInteger(recentMessages) || recentMessages < 1 || recentMessages > 100) {
      setConfigFormError("Recent Messages 需为 1-100 的整数。");
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setConfigFormError("Temperature 需为 0-2 的数字。");
      return;
    }

    const lp = configForm.llmProvider;
    const apiKeyToSend =
      lp.apiKey || (configForm.apiKeyConfigured ? API_KEY_REDACTED : "");
    const hasProvider = lp.baseURL && lp.model && (lp.apiKey || configForm.apiKeyConfigured);

    updateAgent.mutate({
      agentId: editingAgentId,
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
      setCreateFormError("请输入 Agent 名称。");
      return;
    }

    const memoryTopK = Number(createForm.memoryTopK);
    const recentMessages = Number(createForm.recentMessages);
    const temperature = Number(createForm.temperature);

    if (!Number.isInteger(memoryTopK) || memoryTopK < 1 || memoryTopK > 50) {
      setCreateFormError("Memory TopK 需为 1-50 的整数。");
      return;
    }
    if (!Number.isInteger(recentMessages) || recentMessages < 1 || recentMessages > 100) {
      setCreateFormError("Recent Messages 需为 1-100 的整数。");
      return;
    }
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      setCreateFormError("Temperature 需为 0-2 的数字。");
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
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            新建 Agent
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/templates">模板市场</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/chat">打开聊天</Link>
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
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
                      <p className="font-medium flex items-center gap-2 flex-wrap">
                        {agent.name}
                        {publishedAgentIds.has(agent.id) ? (
                          <Badge variant="secondary" className="text-xs">已发布</Badge>
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
                          {agent.config.llmProvider?.model || "未配置"}
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
                        <Link href={`/chat/${agent.id}`}>聊天</Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openConfigDialog(agent)}>
                        配置
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingAgentId(agent.id)}
                        disabled={deleteAgent.isPending}
                      >
                        删除
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/usage?agent=${encodeURIComponent(agent.id)}`}>用量</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/memory?agent=${encodeURIComponent(agent.id)}`}>记忆</Link>
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
                        {publishedAgentIds.has(agent.id) ? "更新发布" : "发布"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {!agents.isLoading && !listErrorMessage && (agents.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground mb-4">还没有 Agent，创建第一个即可开始聊天。</p>
              <Button onClick={() => setCreateDialogOpen(true)}>新建 Agent</Button>
            </div>
          ) : null}
        </div>

        {/* Create Agent Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={(open) => (!open ? closeCreateDialog() : undefined)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>新建 Agent</DialogTitle>
              <DialogDescription>
                填写名称与 LLM 配置，一步完成创建，创建后可立即进入聊天。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="create-agent-name">Agent 名称</Label>
                <Input
                  id="create-agent-name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：Personal Ops Copilot"
                />
              </div>

              {(workspaces.data ?? []).length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="create-agent-workspace">工作空间</Label>
                  <Select
                    value={createForm.workspaceId ?? ""}
                    onValueChange={(v) =>
                      setCreateForm((prev) => ({ ...prev, workspaceId: v || undefined }))
                    }
                  >
                    <SelectTrigger id="create-agent-workspace">
                      <SelectValue placeholder="个人（不属于任何工作空间）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">个人</SelectItem>
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
                <Label htmlFor="create-agent-system-prompt">System Prompt</Label>
                <Textarea
                  id="create-agent-system-prompt"
                  rows={4}
                  value={createForm.systemPrompt}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="定义助手的角色、原则与风格，留空则使用默认长期助手设定。"
                />
              </div>

              <LlmProviderSection
                value={createForm.llmProvider}
                onChange={(lp) => setCreateForm((prev) => ({ ...prev, llmProvider: lp }))}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="create-agent-memory-topk">Memory TopK</Label>
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
                  <Label htmlFor="create-agent-recent-messages">Recent Messages</Label>
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
                  <Label htmlFor="create-agent-temperature">Temperature</Label>
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
                取消
              </Button>
              <Button onClick={doCreateAgent} disabled={createAgent.isPending}>
                {createAgent.isPending ? "创建中..." : "创建并进入聊天"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Agent Config Dialog */}
        <Dialog open={Boolean(editingAgentId)} onOpenChange={(open) => (!open ? closeConfigDialog() : undefined)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Agent 配置</DialogTitle>
              <DialogDescription>
                {selectedAgent ? `正在编辑：${selectedAgent.name}` : "调整该 Agent 的模型与上下文参数。"}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="agent-system-prompt">System Prompt</Label>
                <Textarea
                  id="agent-system-prompt"
                  rows={4}
                  value={configForm.systemPrompt}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="定义助手的角色、原则与风格，留空则使用默认长期助手设定。"
                />
              </div>

              <LlmProviderSection
                value={configForm.llmProvider}
                onChange={(lp) => setConfigForm((prev) => ({ ...prev, llmProvider: lp }))}
                apiKeyPlaceholder={
                  configForm.apiKeyConfigured ? "已配置（留空保留，输入则覆盖）" : undefined
                }
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="agent-memory-topk">Memory TopK</Label>
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
                  <Label htmlFor="agent-recent-messages">Recent Messages</Label>
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
                  <Label htmlFor="agent-temperature">Temperature</Label>
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
                取消
              </Button>
              <Button onClick={saveConfig} disabled={updateAgent.isPending || !editingAgentId}>
                {updateAgent.isPending ? "保存中..." : "保存配置"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={Boolean(deletingAgentId)} onOpenChange={(open) => (!open ? closeDeleteDialog() : undefined)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>删除 Agent</DialogTitle>
              <DialogDescription>
                {deletingAgent
                  ? `确认删除「${deletingAgent.name}」吗？此操作不可恢复。`
                  : "确认删除该 Agent 吗？此操作不可恢复。"}
              </DialogDescription>
            </DialogHeader>
            {deleteErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{deleteErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={closeDeleteDialog} disabled={deleteAgent.isPending}>
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={deleteAgent.isPending || !deletingAgentId}
                onClick={() => {
                  if (!deletingAgentId) return;
                  deleteAgent.mutate({ agentId: deletingAgentId });
                }}
              >
                {deleteAgent.isPending ? "删除中..." : "确认删除"}
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
              <DialogTitle>{publishAgentId && publishedAgentIds.has(publishAgentId) ? "更新模板" : "发布为模板"}</DialogTitle>
              <DialogDescription>
                {publishAgentId && publishedAgentIds.has(publishAgentId)
                  ? "此 Agent 已发布过，确认将更新模板市场的配置与描述。"
                  : "将当前 Agent 的配置发布到模板市场，其他用户可以一键克隆使用。"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label htmlFor="publish-desc">模板描述</Label>
                <Textarea
                  id="publish-desc"
                  rows={3}
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                  placeholder="简要介绍此 Agent 的用途和特点..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={publishPublic}
                  onChange={(e) => setPublishPublic(e.target.checked)}
                  className="rounded"
                />
                公开发布（所有用户可见）
              </label>
              {publishTemplate.error ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {getErrorMessage(publishTemplate.error, "发布失败，请稍后重试。")}
                  </AlertDescription>
                </Alert>
              ) : null}
              {publishTemplate.isSuccess ? (
                <Alert>
                  <AlertDescription>模板发布成功！</AlertDescription>
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
                取消
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
                  ? "提交中..."
                  : publishAgentId && publishedAgentIds.has(publishAgentId)
                    ? "确认更新"
                    : "确认发布"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
