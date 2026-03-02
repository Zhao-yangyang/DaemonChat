"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { MarkdownMessage } from "@/src/components/markdown-message";
import { supabaseBrowserClient } from "@/src/supabaseClient";
import { Send } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

const newSessionKey = () => `s-${Math.random().toString(36).slice(2, 10)}`;
const hasVisibleText = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const extractTextFragments = (value: unknown, depth = 0): string[] => {
  if (depth > 5) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextFragments(item, depth + 1));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const preferredKeys = ["text", "content", "message", "value", "output_text"];
  const preferredFragments = preferredKeys.flatMap((key) => extractTextFragments(record[key], depth + 1));
  if (preferredFragments.length > 0) return preferredFragments;

  if (Array.isArray(record.parts)) {
    const partsFragments = extractTextFragments(record.parts, depth + 1);
    if (partsFragments.length > 0) return partsFragments;
  }

  return [];
};

const toMessageText = (content: unknown): string => {
  const extracted = extractTextFragments(content)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (extracted.length > 0) {
    return extracted.join("\n");
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content ?? "");
  }
};

const toChatMessagesFromEvents = (
  events: Array<{ type: string; content: unknown }>
): ChatMessage[] => {
  const items: ChatMessage[] = [];
  for (const event of events) {
    if (event.type !== "user_message" && event.type !== "assistant_message") {
      continue;
    }
    const text = toMessageText(event.content).trim();
    if (!text) {
      continue;
    }
    items.push({
      role: event.type === "user_message" ? "user" : "assistant",
      content: text,
    });
  }
  return items;
};

const toExportMarkdown = (items: ChatMessage[]): string =>
  items
    .map((item) => `## ${item.role === "user" ? "用户" : "AI"}\n\n${item.content.trim()}`)
    .join("\n\n---\n\n");

const safeFilePart = (value: string): string =>
  value.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "_").slice(0, 40) || "chat";

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();

  const [input, setInput] = useState("");
  const [localModelOverride, setLocalModelOverride] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [localSessionKeys, setLocalSessionKeys] = useState<string[]>([]);
  const [localSessionNames, setLocalSessionNames] = useState<Record<string, string>>({});
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeStreamControllerRef = useRef<AbortController | null>(null);

  const agentList = trpc.agent.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const currentAgent = useMemo(
    () => (agentList.data ?? []).find((a) => a.id === agentId) ?? null,
    [agentList.data, agentId]
  );

  const sessionList = trpc.session.list.useQuery(
    { agentId, limit: 20 },
    { enabled: Boolean(agentId), refetchOnWindowFocus: false }
  );

  const currentSessionKey = sessionKey.trim();
  const messages = messagesBySession[currentSessionKey] ?? [];

  const selectedSession = useMemo(
    () => (sessionList.data ?? []).find((item) => item.sessionKey === currentSessionKey) ?? null,
    [currentSessionKey, sessionList.data]
  );
  const currentSessionId = selectedSession?.id ?? "";

  const transcript = trpc.transcript.list.useQuery(
    { agentId, sessionId: currentSessionId, limit: 200 },
    {
      enabled: Boolean(agentId && currentSessionId),
      refetchOnWindowFocus: false,
    }
  );
  const deleteSessionMutation = trpc.session.delete.useMutation({
    onSuccess: async () => {
      await sessionList.refetch();
    },
  });
  const renameSessionMutation = trpc.session.rename.useMutation({
    onSuccess: async () => {
      await sessionList.refetch();
    },
  });

  const sessionKeys = useMemo(() => {
    const keys: string[] = [];
    const pushed = new Set<string>();
    for (const item of sessionList.data ?? []) {
      if (pushed.has(item.sessionKey)) continue;
      pushed.add(item.sessionKey);
      keys.push(item.sessionKey);
    }
    for (const key of localSessionKeys) {
      if (pushed.has(key)) continue;
      pushed.add(key);
      keys.push(key);
    }
    return keys;
  }, [localSessionKeys, sessionList.data]);

  useEffect(() => {
    const remoteKeys = new Set((sessionList.data ?? []).map((item) => item.sessionKey));
    if (remoteKeys.size === 0) return;
    setLocalSessionKeys((prev) => prev.filter((key) => !remoteKeys.has(key)));
  }, [sessionList.data]);

  useEffect(() => {
    if (sessionKeys.length === 0) return;
    if (!currentSessionKey || !sessionKeys.includes(currentSessionKey)) {
      setSessionKey(sessionKeys[0] ?? "");
    }
  }, [currentSessionKey, sessionKeys]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, currentSessionKey, isStreaming]);

  useEffect(() => {
    if (!currentSessionKey || !transcript.data) {
      return;
    }
    const restored = toChatMessagesFromEvents(transcript.data);
    if (restored.length === 0) {
      return;
    }

    setMessagesBySession((prev) => {
      const existing = prev[currentSessionKey] ?? [];
      if (existing.length > 0) {
        return prev;
      }
      return {
        ...prev,
        [currentSessionKey]: restored,
      };
    });
  }, [currentSessionKey, transcript.data]);

  useEffect(() => {
    setEditingIndex(null);
    setEditingContent("");
  }, [currentSessionKey]);

  const updateMessagesForSession = (
    targetSessionKey: string,
    updater: (items: ChatMessage[]) => ChatMessage[]
  ) => {
    setMessagesBySession((prev) => {
      const next = { ...prev };
      next[targetSessionKey] = updater(prev[targetSessionKey] ?? []);
      return next;
    });
  };

  const appendAssistant = (targetSessionKey: string, chunk: string) => {
    if (!chunk) return;
    updateMessagesForSession(targetSessionKey, (items) => {
      const next = [...items];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, content: last.content + chunk };
      } else {
        next.push({ role: "assistant", content: chunk });
      }
      return next;
    });
  };

  const createSession = () => {
    const key = newSessionKey();
    setSessionKey(key);
    setLocalSessionKeys((prev) => (prev.includes(key) ? prev : [key, ...prev]));
    setLocalSessionNames((prev) => ({ ...prev, [key]: key }));
    setMessagesBySession((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
  };

  const removeSessionLocally = (targetKey: string) => {
    setMessagesBySession((prev) => {
      const next = { ...prev };
      delete next[targetKey];
      return next;
    });
    setLocalSessionNames((prev) => {
      const next = { ...prev };
      delete next[targetKey];
      return next;
    });
    setLocalSessionKeys((prev) => prev.filter((key) => key !== targetKey));
    const fallback = sessionKeys.find((key) => key !== targetKey) ?? "";
    setSessionKey(fallback);
  };

  const deleteCurrentSession = async () => {
    const key = currentSessionKey;
    if (!key) return;
    const confirmed = window.confirm(`确认删除会话「${key}」吗？`);
    if (!confirmed) return;
    if (!currentSessionId) {
      removeSessionLocally(key);
      return;
    }
    await deleteSessionMutation.mutateAsync({
      agentId,
      sessionId: currentSessionId,
    });
    removeSessionLocally(key);
  };

  const runTurn = async (input: {
    targetSessionKey: string;
    userMessage: string;
  }) => {
    const modelOverride = localModelOverride.trim();
    setIsStreaming(true);
    const controller = new AbortController();
    activeStreamControllerRef.current = controller;
    try {
      const session = await supabaseBrowserClient.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        throw new Error("未登录");
      }

      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-access-token": accessToken,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          agentId,
          sessionKey: input.targetSessionKey,
          userInput: input.userMessage,
          system: "",
          model: modelOverride || undefined,
          idempotencyKey,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`请求失败: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedAssistantChunk = false;

      const handleBlock = (block: string) => {
        const line = block
          .split("\n")
          .find((entry) => entry.startsWith("data: "));
        if (!line) {
          return;
        }

        try {
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            value?: string;
            message?: string;
          };

          if (payload.type === "chunk") {
            if (hasVisibleText(payload.value)) {
              receivedAssistantChunk = true;
            }
            appendAssistant(input.targetSessionKey, payload.value ?? "");
          } else if (payload.type === "error") {
            appendAssistant(input.targetSessionKey, `\n错误: ${payload.message ?? "未知错误"}`);
          }
        } catch {
          // ignore malformed chunk
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        blocks.forEach(handleBlock);
      }

      if (!receivedAssistantChunk) {
        updateMessagesForSession(input.targetSessionKey, (items) => {
          const next = [...items];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !hasVisibleText(last.content)) {
            next[next.length - 1] = { ...last, content: "（模型返回空内容）" };
          }
          return next;
        });
      }

      sessionList.refetch();
      if (currentSessionId) {
        transcript.refetch();
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : "未知错误";
      appendAssistant(input.targetSessionKey, `\n错误: ${message}`);
    } finally {
      if (activeStreamControllerRef.current === controller) {
        activeStreamControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  const send = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const activeSessionKey = currentSessionKey || newSessionKey();
    if (!currentSessionKey) {
      setSessionKey(activeSessionKey);
      setLocalSessionKeys((prev) =>
        prev.includes(activeSessionKey) ? prev : [activeSessionKey, ...prev]
      );
    }
    const userMessage = input.trim();

    setInput("");
    updateMessagesForSession(activeSessionKey, (items) => [
      ...items,
      { role: "user", content: userMessage },
      { role: "assistant", content: "" },
    ]);
    await runTurn({
      targetSessionKey: activeSessionKey,
      userMessage,
    });
  };

  const regenerate = async () => {
    if (isStreaming || !currentSessionKey) return;
    const lastAssistantIndex = [...messages]
      .map((item, idx) => ({ item, idx }))
      .reverse()
      .find(({ item }) => item.role === "assistant" && hasVisibleText(item.content))?.idx;
    if (lastAssistantIndex === undefined || lastAssistantIndex <= 0) return;
    const previous = messages[lastAssistantIndex - 1];
    if (!previous || previous.role !== "user" || !hasVisibleText(previous.content)) {
      return;
    }

    updateMessagesForSession(currentSessionKey, (items) => {
      const next = [...items];
      next.splice(lastAssistantIndex, 1);
      next.push({ role: "assistant", content: "" });
      return next;
    });

    await runTurn({
      targetSessionKey: currentSessionKey,
      userMessage: previous.content,
    });
  };

  const startEdit = (idx: number, content: string) => {
    if (isStreaming) return;
    setEditingIndex(idx);
    setEditingContent(content);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingContent("");
  };

  const saveEditAndResend = async () => {
    if (isStreaming || editingIndex === null || !currentSessionKey) return;
    const edited = editingContent.trim();
    if (!edited) return;
    const index = editingIndex;
    const original = messages[index];
    if (!original || original.role !== "user") return;

    setEditingIndex(null);
    setEditingContent("");
    updateMessagesForSession(currentSessionKey, (items) => [
      ...items.slice(0, index),
      { role: "user", content: edited },
      { role: "assistant", content: "" },
    ]);
    await runTurn({
      targetSessionKey: currentSessionKey,
      userMessage: edited,
    });
  };

  const stopStreaming = () => {
    activeStreamControllerRef.current?.abort();
  };

  const getSessionLabel = (targetKey: string) => {
    const remote = (sessionList.data ?? []).find((item) => item.sessionKey === targetKey);
    const label = remote?.displayName?.trim() || localSessionNames[targetKey] || targetKey;
    return label || targetKey;
  };

  const renameCurrentSession = async () => {
    const key = currentSessionKey;
    if (!key) return;
    const currentName = getSessionLabel(key);
    const nextName = window.prompt("请输入会话名称", currentName)?.trim();
    if (!nextName || nextName === currentName) return;
    if (!currentSessionId) {
      setLocalSessionNames((prev) => ({ ...prev, [key]: nextName }));
      return;
    }
    await renameSessionMutation.mutateAsync({
      agentId,
      sessionId: currentSessionId,
      displayName: nextName,
    });
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `chat-${safeFilePart(currentAgent?.name ?? "agent")}-${safeFilePart(currentSessionKey || "session")}-${now}.md`;
    const blob = new Blob([toExportMarkdown(messages)], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  return (
    <DashboardShell
      title={currentAgent ? currentAgent.name : "Chat"}
      description="直接对话即可，系统会自动记录会话和用量。"
      actions={
        <div className="flex items-center gap-2">
          {/* Agent 切换 */}
          <Select value={agentId} onValueChange={(id) => router.push(`/chat/${id}`)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="选择 Agent" />
            </SelectTrigger>
            <SelectContent>
              {(agentList.data ?? []).map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Session 切换 */}
          {sessionKeys.length > 0 ? (
            <Select value={currentSessionKey || undefined} onValueChange={setSessionKey}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="会话" />
              </SelectTrigger>
              <SelectContent>
                {sessionKeys.map((key) => (
                  <SelectItem key={key} value={key}>
                    {getSessionLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Button size="xs" variant="outline" onClick={createSession} disabled={isStreaming}>
            新会话
          </Button>
          {currentSessionKey ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => void renameCurrentSession()}
              disabled={renameSessionMutation.isPending || isStreaming}
            >
              {renameSessionMutation.isPending ? "重命名中" : "重命名"}
            </Button>
          ) : null}
          {currentSessionKey ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => void deleteCurrentSession()}
              disabled={deleteSessionMutation.isPending || isStreaming}
            >
              {deleteSessionMutation.isPending ? "删除中" : "删会话"}
            </Button>
          ) : null}
          {currentSessionId ? (
            <Button
              size="xs"
              variant="outline"
              disabled={transcript.isFetching}
              onClick={async () => {
                const refreshed = await transcript.refetch();
                const restored = toChatMessagesFromEvents(refreshed.data ?? []);
                setMessagesBySession((prev) => ({ ...prev, [currentSessionKey]: restored }));
              }}
            >
              {transcript.isFetching ? "同步中" : "同步"}
            </Button>
          ) : null}
          {isStreaming ? (
            <Badge variant="secondary" className="text-xs">回复中</Badge>
          ) : null}
          {messages.length > 0 ? (
            <Button size="xs" variant="outline" onClick={exportChat}>
              导出
            </Button>
          ) : null}
        </div>
      }
    >
      {/* Chat fills entire content area */}
      <div className="flex h-full flex-col">
        {/* Messages */}
        <ScrollArea ref={scrollAreaRef} className="flex-1">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageIcon className="size-6 text-primary" />
                </div>
                <h2 className="text-lg font-medium text-foreground">开始新对话</h2>
                <p className="mt-1 text-sm text-muted-foreground">输入你的问题即可开始</p>
              </div>
            ) : null}

            <div className="space-y-6">
              {messages.map((msg, idx) => {
                const isUser = msg.role === "user";
                const hasVisibleContent = hasVisibleText(msg.content);
                const isPendingAssistant = msg.role === "assistant" && !hasVisibleContent && isStreaming;
                const isLastAssistant =
                  msg.role === "assistant" && idx === messages.length - 1 && hasVisibleContent;
                if (!isUser && !hasVisibleContent && !isPendingAssistant) {
                  return null;
                }

                return (
                  <div key={`${msg.role}-${idx}`} className={cn("space-y-2", isUser && "items-end")}>
                    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
                      <div
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isUser ? "你" : "AI"}
                      </div>
                      <div
                        className={cn(
                          "max-w-[min(85%,42rem)] rounded-2xl px-4 py-3",
                          isUser
                            ? "bg-primary text-primary-foreground text-sm leading-relaxed"
                            : "bg-muted text-foreground"
                        )}
                      >
                        {isUser ? (
                          editingIndex === idx ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingContent}
                                onChange={(event) => setEditingContent(event.target.value)}
                                className="min-h-20 resize-y bg-background text-foreground"
                                aria-label="编辑消息"
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="xs" variant="secondary" onClick={cancelEdit}>
                                  取消
                                </Button>
                                <Button
                                  size="xs"
                                  variant="outline"
                                  onClick={() => void saveEditAndResend()}
                                  disabled={!editingContent.trim()}
                                >
                                  保存并重发
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )
                        ) : (
                          hasVisibleContent ? (
                            <MarkdownMessage content={msg.content} />
                          ) : (
                            isPendingAssistant ? <p className="text-muted-foreground">思考中...</p> : null
                          )
                        )}
                      </div>
                    </div>
                    <div className={cn("pl-10", isUser && "pr-10 pl-0 text-right")}>
                      {isUser && editingIndex !== idx && !isStreaming ? (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => startEdit(idx, msg.content)}
                        >
                          编辑
                        </Button>
                      ) : null}
                      {!isUser && isLastAssistant && !isStreaming ? (
                        <Button size="xs" variant="ghost" onClick={() => void regenerate()}>
                          重新生成
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* Input area — fixed at bottom, centered */}
        <div className="border-t bg-card px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="mb-2">
              <Input
                value={localModelOverride}
                onChange={(e) => setLocalModelOverride(e.target.value)}
                placeholder={`模型覆盖（留空使用默认${currentAgent?.config.model ? `: ${currentAgent.config.model}` : ""}）`}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入消息..."
                aria-label="输入消息"
                className="min-h-10 max-h-40 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
                onKeyDown={(event) => {
                  if ((event.nativeEvent as KeyboardEvent).isComposing) {
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              {isStreaming ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 rounded-lg px-3 text-xs"
                  onClick={stopStreaming}
                >
                  停止生成
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  className="shrink-0 rounded-lg"
                  onClick={send}
                  disabled={!input.trim()}
                >
                  <Send className="size-4" />
                  <span className="sr-only">发送</span>
                </Button>
              )}
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Enter 发送 · Shift + Enter 换行
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
