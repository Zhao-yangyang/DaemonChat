"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  LLM_PROVIDER_PRESETS,
  CUSTOM_PROVIDER_ID,
  findProviderPreset,
  getDefaultModelForPreset,
  detectPresetFromConfig,
} from "@daemon/domain";
import type { LlmProviderPreset } from "@daemon/domain";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { formatId } from "@/src/lib/format";
import { ProviderIcon } from "@/src/components/provider-icon";
import { ModelCombobox } from "@/src/components/model-combobox";

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
  llmProvider: {
    presetId: string;
    model: string;
    baseURL: string;
    apiKey: string;
    sdkProvider: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
  };
};

const EMPTY_CONFIG_FORM: AgentConfigForm = {
  systemPrompt: "",
  memoryTopK: "8",
  recentMessages: "20",
  temperature: "0.7",
  llmProvider: { presetId: "", model: "", baseURL: "", apiKey: "", sdkProvider: "openai" },
};

export default function AgentsPage() {
  const [name, setName] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<AgentConfigForm>(EMPTY_CONFIG_FORM);
  const [configFormError, setConfigFormError] = useState<string | null>(null);
  const [dynamicProviders, setDynamicProviders] = useState<LlmProviderPreset[]>(LLM_PROVIDER_PRESETS);
  const [dynamicModels, setDynamicModels] = useState<Array<{id: string; name: string}>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const { session, isResolved } = useSession();

  useEffect(() => {
    fetch("/api/providers")
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.providers)) {
          setDynamicProviders(data.providers);
        }
      })
      .catch(err => console.error("Failed to fetch dynamic providers", err));
  }, []);

  // Fetch models dynamically when provider or API key changes
  useEffect(() => {
    const { presetId, apiKey, baseURL, sdkProvider } = configForm.llmProvider;

    // 如果没有选择任何 Provider 或选了自定义
    if (!presetId || presetId === CUSTOM_PROVIDER_ID) {
      setDynamicModels([]);
      return;
    }

    // 默认情况：先立刻加载当前 Provider 的精选预设静态模型！
    // 保证即便获取失败，模型下拉依旧有内置可选项。
    const preset = dynamicProviders.find(p => p.id === presetId);
    if (!preset) return;
    const fallbackStaticModels = preset.models.map(m => ({ id: m.id, name: m.label }));
    setDynamicModels(fallbackStaticModels);

    // 发起网络请求获取动态模型
    setModelsLoading(true);
    fetch("/api/providers/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdkProvider, apiKey, baseURL, providerId: presetId }),
    })
      .then((r) => r.json())
      .then((data) => {
        // 如果获取到了最新的动态模型全集，就全量替换掉静态预设
        if (data.models && data.models.length > 0) {
          setDynamicModels(data.models);
          
          // 如果用户还没选择 model，或是当前选择的 model 不在新列表里，默认给他选最新的第一个
          setConfigForm(prev => {
            const currentSelected = prev.llmProvider.model;
            const exists = data.models.some((m: { id: string }) => m.id === currentSelected);
            if (!currentSelected || !exists) {
              return {
                ...prev,
                llmProvider: { ...prev.llmProvider, model: data.models[0].id }
              };
            }
            return prev;
          });
        }
      })
      .catch(() => {
        // 请求出错，保持原有的静态 fallbackStaticModels 不变即可
      })
      .finally(() => setModelsLoading(false));
  }, [
    configForm.llmProvider.presetId,
    configForm.llmProvider.apiKey,
    configForm.llmProvider.baseURL,
    configForm.llmProvider.sdkProvider,
  ]);

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
      model: string;
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
        apiKey: agent.config.llmProvider?.apiKey ?? "",
        sdkProvider: agent.config.llmProvider?.sdkProvider ?? "openai",
      },
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
    const hasProvider = lp.baseURL && lp.model && lp.apiKey;
    const preset = dynamicProviders.find(p => p.id === lp.presetId);

    updateAgent.mutate({
      agentId: editingAgentId,
      config: {
        systemPrompt: configForm.systemPrompt,
        model: lp.model.trim(),
        memoryTopK,
        recentMessages,
        temperature,
        ...(hasProvider
          ? {
              llmProvider: {
                baseURL: lp.baseURL,
                model: lp.model.trim(),
                apiKey: lp.apiKey,
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
                      <p className="font-medium flex items-center gap-2">
                        {agent.name}
                        <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground ml-2 px-2 py-0.5 rounded-full bg-muted/50">
                          <ProviderIcon 
                            providerId={
                              agent.config.llmProvider?.presetId && agent.config.llmProvider.presetId !== "__custom__"
                                ? agent.config.llmProvider.presetId
                                : agent.config.llmProvider?.sdkProvider ?? "openai"
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
                        发布
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
                  placeholder="You are a helpful AI assistant."
                />
              </div>

              <div className="grid gap-1.5 rounded-md border p-4 bg-muted/20">
                <Label className="text-base font-semibold">LLM Provider</Label>
                <p className="text-xs text-muted-foreground mb-2">选择大模型提供商，填入 API Key 即可使用。</p>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">提供商</Label>
                    <Select
                      value={configForm.llmProvider.presetId}
                      onValueChange={(val) => {
                        if (val === CUSTOM_PROVIDER_ID) {
                          setConfigForm((prev) => ({
                            ...prev,
                            llmProvider: {
                              ...prev.llmProvider,
                              presetId: CUSTOM_PROVIDER_ID,
                              baseURL: "",
                              model: "",
                              sdkProvider: "openai",
                            },
                          }));
                        } else {
                          const preset = dynamicProviders.find((p) => p.id === val);
                          if (!preset) return;
                          setConfigForm((prev) => ({
                            ...prev,
                            llmProvider: {
                              ...prev.llmProvider,
                              presetId: val,
                              baseURL: preset.baseURL,
                              model: getDefaultModelForPreset(preset),
                              sdkProvider: preset.sdkProvider ?? "openai",
                            },
                          }));
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择提供商..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dynamicProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              <ProviderIcon providerId={p.id} size={16} />
                              {p.label}
                            </div>
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_PROVIDER_ID}>自定义 (Advanced)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {configForm.llmProvider.presetId && configForm.llmProvider.presetId !== CUSTOM_PROVIDER_ID && (() => {
                    const preset = dynamicProviders.find((p) => p.id === configForm.llmProvider.presetId);
                    return preset ? (
                      <div className="grid gap-1.5">
                        <Label className="text-xs">模型</Label>
                        <ModelCombobox
                          value={configForm.llmProvider.model}
                          onChange={(val: string) =>
                            setConfigForm((prev) => ({
                              ...prev,
                              llmProvider: { ...prev.llmProvider, model: val },
                            }))
                          }
                          models={dynamicModels}
                          loading={modelsLoading}
                          placeholder="选择或输入模型"
                        />
                      </div>
                    ) : null;
                  })()}

                  {configForm.llmProvider.presetId === CUSTOM_PROVIDER_ID && (
                    <>
                      <div className="grid gap-1.5">
                        <Label htmlFor="llm-baseurl" className="text-xs">Base URL</Label>
                        <Input
                          id="llm-baseurl"
                          value={configForm.llmProvider.baseURL}
                          onChange={(e) => setConfigForm((prev) => ({ ...prev, llmProvider: { ...prev.llmProvider, baseURL: e.target.value } }))}
                          placeholder="https://api.example.com/v1"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor="llm-model" className="text-xs">Model Name</Label>
                        <Input
                          id="llm-model"
                          value={configForm.llmProvider.model}
                          onChange={(e) => setConfigForm((prev) => ({ ...prev, llmProvider: { ...prev.llmProvider, model: e.target.value } }))}
                          placeholder="model-name"
                        />
                      </div>
                    </>
                  )}

                  {configForm.llmProvider.presetId && (
                    <div className="grid gap-1.5">
                      <Label htmlFor="llm-apikey" className="text-xs">API Key</Label>
                      <Input
                        id="llm-apikey"
                        type="password"
                        value={configForm.llmProvider.apiKey}
                        onChange={(e) => setConfigForm((prev) => ({ ...prev, llmProvider: { ...prev.llmProvider, apiKey: e.target.value } }))}
                        placeholder={findProviderPreset(configForm.llmProvider.presetId)?.apiKeyPlaceholder ?? "sk-..."}
                      />
                      {(() => {
                        const helpUrl = findProviderPreset(configForm.llmProvider.presetId)?.apiKeyHelpUrl;
                        return helpUrl ? (
                          <a href={helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                            获取 API Key
                          </a>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              </div>

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
              <DialogTitle>发布为模板</DialogTitle>
              <DialogDescription>将当前 Agent 的配置发布到模板市场，其他用户可以一键克隆使用。</DialogDescription>
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
                {publishTemplate.isPending ? "发布中..." : "确认发布"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardShell>
  );
}
