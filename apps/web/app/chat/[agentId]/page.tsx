"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { supabaseBrowserClient } from "@/src/supabaseClient";

type ChatMessage = { role: "user" | "assistant"; content: string };

const newSessionKey = () => `s-${Math.random().toString(36).slice(2, 10)}`;

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState("main");
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({
    main: [],
  });
  const [isStreaming, setIsStreaming] = useState(false);

  const sessionList = trpc.session.list.useQuery(
    { agentId, limit: 20 },
    { enabled: Boolean(agentId), refetchOnWindowFocus: false }
  );

  const currentSessionKey = sessionKey.trim() || "main";
  const messages = messagesBySession[currentSessionKey] ?? [];

  const sessionKeys = useMemo(() => {
    const keys = new Set<string>(["main", ...Object.keys(messagesBySession)]);
    for (const item of sessionList.data ?? []) {
      keys.add(item.sessionKey);
    }
    return Array.from(keys);
  }, [messagesBySession, sessionList.data]);

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
    setMessagesBySession((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
  };

  const send = async () => {
    if (!input.trim() || isStreaming) {
      return;
    }

    const activeSessionKey = currentSessionKey;
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

      sessionList.refetch();
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
          <Button asChild size="sm" variant="outline" className="border-[var(--line-soft)] bg-white">
            <Link href={`/usage?agent=${encodeURIComponent(agentId)}`}>用量</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-[var(--line-soft)] bg-white">
            <Link href={`/memory?agent=${encodeURIComponent(agentId)}`}>记忆</Link>
          </Button>
        </div>
      }
    >
      <section className="space-y-4">
        <Card className="border-[var(--line-soft)] bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-muted)]">Session</p>
            <Select value={currentSessionKey} onValueChange={setSessionKey}>
              <SelectTrigger className="w-[220px] border-[var(--line-soft)] bg-white">
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
            <Button
              size="sm"
              variant="outline"
              className="border-[var(--line-soft)] bg-white"
              onClick={createSession}
              disabled={isStreaming}
            >
              新会话
            </Button>
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white text-[var(--ink-muted)]">
              {isStreaming ? "回复中" : "就绪"}
            </Badge>
            {sessionList.isFetching ? (
              <Badge variant="outline" className="border-[var(--line-soft)] bg-white text-[var(--ink-muted)]">
                同步中
              </Badge>
            ) : null}
          </div>
        </Card>

        <Card className="flex min-h-[68vh] flex-col border-[var(--line-soft)] bg-white p-4 sm:p-5">
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line-soft)] bg-[var(--brand-soft)]/35 p-5 text-sm text-[var(--ink-muted)]">
                直接输入你的问题即可开始。
              </div>
            ) : null}

            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const isPendingAssistant = msg.role === "assistant" && !msg.content && isStreaming;

              return (
                <div key={`${msg.role}-${idx}`} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      isUser ? "bg-[var(--brand)] text-white" : "border border-[var(--line-soft)] bg-white text-[var(--ink)]"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.content || (isPendingAssistant ? "思考中..." : "")}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息。Ctrl/⌘ + Enter 发送"
              className="min-h-24 border-[var(--line-soft)] bg-white"
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--ink-muted)]">发送时会自动携带幂等键，避免重复计费。</p>
              <Button onClick={send} disabled={isStreaming || !input.trim()}>
                {isStreaming ? "发送中..." : "发送"}
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </DashboardShell>
  );
}
