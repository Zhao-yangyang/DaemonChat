"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/src/i18n/navigation";
import { Button, Card, CardContent, ScrollArea, Textarea } from "@daemon/ui";
import { MarkdownMessage } from "@/src/components/markdown-message";
import { Send, Loader2 } from "lucide-react";

const hasVisibleText = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

type ShareChatEmbedProps = {
  agentId: string;
  agentName: string;
  maxTurns: number;
};

export function ShareChatEmbed({ agentId, agentName, maxTurns }: ShareChatEmbedProps) {
  const t = useTranslations("share");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>(
    [],
  );
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userTurnCount = messages.filter((m) => m.role === "user").length;
  const nextTurnWillBe = userTurnCount + 1;
  const atMaxTurns = nextTurnWillBe > maxTurns;

  const send = async () => {
    const text = input.trim();
    if (!text || isStreaming || atMaxTurns) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    const controller = new AbortController();
    try {
      const res = await fetch("/api/chat/stream/anonymous", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          userInput: text,
        }),
      });

      if (res.status === 403) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: t("anonymousDisabled"),
          };
          return next;
        });
        return;
      }

      if (res.status === 429) {
        try {
          const body = await res.json();
          if (body.error === "max_turns_exceeded") {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "assistant",
                content: body.message ?? t("trialEnded"),
              };
              return next;
            });
            return;
          }
        } catch {
          // ignore
        }
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: t("rateLimited"),
          };
          return next;
        });
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`请求失败: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedChunk = false;

      const appendChunk = (chunk: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + (chunk ?? "") };
          }
          return next;
        });
        if (hasVisibleText(chunk)) receivedChunk = true;
      };

      const handleBlock = (block: string) => {
        const line = block.split("\n").find((entry) => entry.startsWith("data: "));
        if (!line) return;
        try {
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            value?: string;
            message?: string;
          };
          if (payload.type === "chunk") {
            appendChunk(payload.value ?? "");
          } else if (payload.type === "error") {
            appendChunk(`\n错误: ${payload.message ?? "未知错误"}`);
          }
        } catch {
          // ignore
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

      if (!receivedChunk) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: "（模型返回空内容）",
          };
          return next;
        });
      }

      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      if (controller.signal.aborted) return;
      const msg = error instanceof Error ? error.message : "未知错误";
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: `错误: ${msg}` };
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <div className="flex flex-col">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">{agentName}</p>
            <p className="text-xs text-muted-foreground">
              {t("anonymousTrialHint", { max: maxTurns })}
            </p>
          </div>
          <ScrollArea className="h-[280px] flex-1">
            <div className="space-y-4 p-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  {t("anonymousPlaceholder")}
                </p>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "ml-4 text-right" : "mr-4"}>
                    <span className="text-xs text-muted-foreground">
                      {m.role === "user" ? "你" : "AI"}
                    </span>
                    <div
                      className={
                        m.role === "user"
                          ? "mt-1 inline-block rounded-lg bg-primary/10 px-3 py-2 text-sm"
                          : "mt-1 rounded-lg bg-secondary px-3 py-2 text-sm"
                      }
                    >
                      {m.role === "assistant" && m.content ? (
                        <MarkdownMessage content={m.content} />
                      ) : m.role === "user" ? (
                        m.content
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="size-4 animate-spin" />
                          思考中…
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
          {atMaxTurns ? (
            <div className="border-t p-4">
              <p className="mb-3 text-center text-sm text-muted-foreground">{t("trialEnded")}</p>
              <Button asChild className="w-full">
                <Link href="/" data-testid="share-login-cta">
                  {t("loginToContinue")}
                </Link>
              </Button>
            </div>
          ) : (
            <div className="border-t p-3">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t("anonymousInputPlaceholder")}
                  className="min-h-[44px] resize-none"
                  rows={1}
                  disabled={isStreaming}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="shrink-0"
                  onClick={() => send()}
                  disabled={!input.trim() || isStreaming}
                  aria-label={t("try")}
                  data-testid="share-try"
                >
                  {isStreaming ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
