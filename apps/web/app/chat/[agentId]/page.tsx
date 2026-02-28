"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
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

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [localSessionKeys, setLocalSessionKeys] = useState<string[]>([]);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

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
    setMessagesBySession((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
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

    setIsStreaming(true);
    try {
      const session = await supabaseBrowserClient.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        throw new Error("未登录");
      }

      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-token": accessToken,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          agentId,
          sessionKey: activeSessionKey,
          userInput: userMessage,
          system: "",
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
            appendAssistant(activeSessionKey, payload.value ?? "");
          } else if (payload.type === "error") {
            appendAssistant(activeSessionKey, `\n错误: ${payload.message ?? "未知错误"}`);
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
        updateMessagesForSession(activeSessionKey, (items) => {
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
      const message = error instanceof Error ? error.message : "未知错误";
      appendAssistant(activeSessionKey, `\n错误: ${message}`);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <DashboardShell
      title="Chat"
      description="直接对话即可，系统会自动记录会话和用量。"
      actions={
        <div className="flex items-center gap-2">
          <Select value={currentSessionKey || undefined} onValueChange={setSessionKey}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="选择会话" />
            </SelectTrigger>
            <SelectContent>
              {sessionKeys.map((key) => (
                <SelectItem key={key} value={key}>
                  {key}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="xs" variant="outline" onClick={createSession} disabled={isStreaming}>
            新会话
          </Button>
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
                if (!isUser && !hasVisibleContent && !isPendingAssistant) {
                  return null;
                }

                return (
                  <div key={`${msg.role}-${idx}`} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
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
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        hasVisibleContent ? (
                          <MarkdownMessage content={msg.content} />
                        ) : (
                          isPendingAssistant ? <p className="text-muted-foreground">思考中...</p> : null
                        )
                      )}
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
              <Button
                size="icon-sm"
                className="shrink-0 rounded-lg"
                onClick={send}
                disabled={isStreaming || !input.trim()}
              >
                <Send className="size-4" />
                <span className="sr-only">发送</span>
              </Button>
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
