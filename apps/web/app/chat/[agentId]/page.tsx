"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import { Badge, Button, Card, Input, Textarea, cn } from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { supabaseBrowserClient } from "@/src/supabaseClient";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState("main");
  const [draftSessionKey, setDraftSessionKey] = useState("");
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

  const stats = useMemo(() => {
    const userCount = messages.filter((item) => item.role === "user").length;
    const assistantCount = messages.filter((item) => item.role === "assistant").length;
    return {
      total: messages.length,
      userCount,
      assistantCount,
    };
  }, [messages]);

  const updateMessagesForSession = (
    targetSessionKey: string,
    updater: (messages: ChatMessage[]) => ChatMessage[]
  ) => {
    setMessagesBySession((prev) => {
      const next = { ...prev };
      next[targetSessionKey] = updater(prev[targetSessionKey] ?? []);
      return next;
    });
  };

  const appendAssistant = (targetSessionKey: string, chunk: string) => {
    if (!chunk) return;
    updateMessagesForSession(targetSessionKey, (previousMessages) => {
      const next = [...previousMessages];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, content: last.content + chunk };
      } else {
        next.push({ role: "assistant", content: chunk });
      }
      return next;
    });
  };

  const activateSession = (nextKey: string) => {
    const normalized = nextKey.trim();
    if (!normalized) return;
    setSessionKey(normalized);
    setDraftSessionKey("");
  };

  const send = async () => {
    if (!input.trim() || isStreaming) return;

    const activeSessionKey = currentSessionKey;
    const userMessage = input.trim();

    setInput("");
    updateMessagesForSession(activeSessionKey, (previousMessages) => [
      ...previousMessages,
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
        if (!line) return;
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
      title={`Agent Chat · ${agentId}`}
      description="实时对话会写入 transcript 与 usage ledger。使用 Ctrl/⌘ + Enter 快速发送。"
      actions={
        <Button
          variant="outline"
          className="border-[var(--line-soft)] bg-white"
          onClick={() => updateMessagesForSession(currentSessionKey, () => [])}
          disabled={messages.length === 0 || isStreaming}
        >
          清空当前会话视图
        </Button>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="flex min-h-[66vh] flex-col border-[var(--line-soft)] bg-white/92 p-5 shadow-[0_12px_30px_rgba(24,38,64,0.08)]">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[var(--line-soft)] bg-white">
                Session: {currentSessionKey}
              </Badge>
              <Badge variant="outline" className="border-[var(--line-soft)] bg-white">
                {isStreaming ? "Streaming" : "Idle"}
              </Badge>
            </div>
            <p className="text-xs text-[var(--ink-muted)]">{stats.total} 条消息</p>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--line-soft)] bg-[var(--brand-soft)]/40 p-6 text-sm leading-relaxed text-[var(--ink-muted)]">
                还没有消息。你可以先给 Agent 一个任务背景，再发第一条指令。
              </div>
            ) : null}

            {messages.map((msg, idx) => {
              const isUser = msg.role === "user";
              const isPendingAssistant = msg.role === "assistant" && !msg.content && isStreaming;
              return (
                <div
                  key={`${msg.role}-${idx}`}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                      isUser
                        ? "bg-[var(--brand)] text-white shadow-[0_10px_22px_rgba(24,86,255,0.32)]"
                        : "border border-[var(--line-soft)] bg-white text-[var(--ink)]"
                    )}
                  >
                    <p className="mb-2 text-[11px] uppercase tracking-[0.14em] opacity-80">
                      {isUser ? "You" : "Assistant"}
                    </p>
                    <p className="whitespace-pre-wrap">
                      {msg.content || (isPendingAssistant ? "思考中..." : "")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-3 border-t border-[var(--line-soft)] pt-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息，Ctrl/⌘ + Enter 发送"
              className="min-h-28 border-[var(--line-soft)] bg-white"
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--ink-muted)]">为避免重复计费，发送时会自动携带幂等键。</p>
              <Button onClick={send} disabled={isStreaming || !input.trim()}>
                {isStreaming ? "发送中..." : "发送消息"}
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 border-[var(--line-soft)] bg-white/90 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Sessions</p>
            <div className="flex gap-2">
              <Input
                value={draftSessionKey}
                onChange={(event) => setDraftSessionKey(event.target.value)}
                placeholder="输入 sessionKey"
                className="h-9 border-[var(--line-soft)] bg-white"
                disabled={isStreaming}
              />
              <Button
                type="button"
                variant="outline"
                className="border-[var(--line-soft)] bg-white"
                disabled={!draftSessionKey.trim() || isStreaming}
                onClick={() => activateSession(draftSessionKey)}
              >
                切换
              </Button>
            </div>

            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {(sessionList.data ?? []).map((item) => {
                const active = item.sessionKey === currentSessionKey;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => activateSession(item.sessionKey)}
                    disabled={isStreaming}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2 text-left text-xs transition",
                      active
                        ? "border-[var(--brand)] bg-[var(--brand-soft)]/70 text-[var(--ink-strong)]"
                        : "border-[var(--line-soft)] bg-white text-[var(--ink-muted)] hover:border-[var(--brand)]/50"
                    )}
                  >
                    <p className="truncate font-medium">{item.sessionKey}</p>
                    <p className="mt-1 text-[10px] opacity-80">{item.lastActiveAt}</p>
                  </button>
                );
              })}
              {!sessionList.isLoading && (sessionList.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-[var(--ink-muted)]">暂无历史会话，发送后会自动出现。</p>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-3 border-[var(--line-soft)] bg-white/90 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Conversation Stats</p>
            <div className="grid gap-2 text-sm text-[var(--ink)]">
              <div className="flex items-center justify-between rounded-xl bg-[var(--brand-soft)]/60 px-3 py-2">
                <span>User</span>
                <strong>{stats.userCount}</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[var(--brand-soft)]/35 px-3 py-2">
                <span>Assistant</span>
                <strong>{stats.assistantCount}</strong>
              </div>
            </div>
          </Card>

          <Card className="space-y-2 border-[var(--line-soft)] bg-white/90 p-5 text-sm text-[var(--ink-muted)]">
            <p className="font-semibold text-[var(--ink-strong)]">调试建议</p>
            <p>如果输出为空或中断，先检查模型 key、fallback 配置和 stream 路由日志。</p>
            <p>你也可以在 Usage 页确认本轮请求是否被成功记账。</p>
          </Card>
        </div>
      </section>
    </DashboardShell>
  );
}
