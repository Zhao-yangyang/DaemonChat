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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Textarea,
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

type AgentConfigForm = {
  systemPrompt: string;
  model: string;
  memoryTopK: string;
  recentMessages: string;
  temperature: string;
  llmProvider: {
    model: string;
    baseURL: string;
    apiKey: string;
  };
};

const EMPTY_CONFIG_FORM: AgentConfigForm = {
  systemPrompt: "",
  model: "",
  memoryTopK: "8",
  recentMessages: "20",
  temperature: "0.7",
  llmProvider: { model: "", baseURL: "", apiKey: "" },
};

export default function AgentsPage() {
  const [name, setName] = useState("");
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState<AgentConfigForm>(EMPTY_CONFIG_FORM);
  const [configFormError, setConfigFormError] = useState<string | null>(null);
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
      } | null;
    };
  }) => {
    setEditingAgentId(agent.id);
    setConfigForm({
      systemPrompt: agent.config.systemPrompt ?? "",
      model: agent.config.model ?? "",
      memoryTopK: String(agent.config.memoryTopK ?? 8),
      recentMessages: String(agent.config.recentMessages ?? 20),
      temperature: String(agent.config.temperature ?? 0.7),
      llmProvider: {
        model: agent.config.llmProvider?.model ?? "",
        baseURL: agent.config.llmProvider?.baseURL ?? "",
        apiKey: agent.config.llmProvider?.apiKey ?? "",
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

    updateAgent.mutate({
      agentId: editingAgentId,
      config: {
        systemPrompt: configForm.systemPrompt,
        model: configForm.model.trim(),
        memoryTopK,
        recentMessages,
        temperature,
        ...(configForm.llmProvider.baseURL && configForm.llmProvider.model && configForm.llmProvider.apiKey
          ? { llmProvider: configForm.llmProvider }
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
          <DialogContent className="sm:max-w-2xl">
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

              <div className="grid gap-1.5">
                <Label htmlFor="agent-model">模型</Label>
                <Input
                  id="agent-model"
                  value={configForm.model}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="留空则使用系统默认模型"
                />
              </div>

              <div className="grid gap-1.5 rounded-md border p-4 bg-muted/20">
                <Label className="text-base font-semibold">自配置大模型 (LLM Provider)</Label>
                <p className="text-xs text-muted-foreground mb-2">如果您想让该 Agent 独立使用指定的大模型接口，请在此配置。若需要使配置生效，三项必须全部填写。</p>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="llm-baseurl" className="text-xs">Base URL</Label>
                    <Input
                      id="llm-baseurl"
                      value={configForm.llmProvider.baseURL}
                      onChange={(e) => setConfigForm((prev) => ({ ...prev, llmProvider: { ...prev.llmProvider, baseURL: e.target.value } }))}
                      placeholder="https://api.deepseek.com"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="llm-model" className="text-xs">Model Name</Label>
                    <Input
                      id="llm-model"
                      value={configForm.llmProvider.model}
                      onChange={(e) => setConfigForm((prev) => ({ ...prev, llmProvider: { ...prev.llmProvider, model: e.target.value } }))}
                      placeholder="deepseek-chat"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="llm-apikey" className="text-xs">API Key</Label>
                    <Input
                      id="llm-apikey"
                      type="password"
                      value={configForm.llmProvider.apiKey}
                      onChange={(e) => setConfigForm((prev) => ({ ...prev, llmProvider: { ...prev.llmProvider, apiKey: e.target.value } }))}
                      placeholder="sk-..."
                    />
                  </div>
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
