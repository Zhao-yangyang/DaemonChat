"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, Input } from "@daemon/ui";
import { supabaseBrowserClient } from "@/src/supabaseClient";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const appendAssistant = (chunk: string) => {
    if (!chunk) return;
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, content: last.content + chunk };
      } else {
        next.push({ role: "assistant", content: chunk });
      }
      return next;
    });
  };

  const send = async () => {
    if (!input.trim() || isStreaming) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
      { role: "assistant", content: "" },
    ]);

    setIsStreaming(true);
    try {
      const session = await supabaseBrowserClient.auth.getSession();
      const userId = session.data.session?.user.id;
      const accessToken = session.data.session?.access_token;
      if (!userId || !accessToken) {
        throw new Error("未登录");
      }

      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          "x-access-token": accessToken,
        },
        body: JSON.stringify({
          agentId,
          sessionKey: "main",
          userInput: userMessage,
          system: "",
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
            appendAssistant(payload.value ?? "");
          } else if (payload.type === "error") {
            appendAssistant(`\n错误: ${payload.message ?? "未知错误"}`);
          }
        } catch {
          // ignore parse errors
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      appendAssistant(`\n错误: ${message}`);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <main>
      <h2>Chat</h2>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {messages.map((msg, idx) => (
            <div key={idx} style={{ alignSelf: msg.role === "user" ? "flex-end" : "flex-start" }}>
              <Card>
                <strong>{msg.role === "user" ? "You" : "Agent"}</strong>
                <p>{msg.content}</p>
              </Card>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 16, display: "flex", gap: 12 }}>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入消息" />
        <Button onClick={send} disabled={isStreaming}>
          发送
        </Button>
      </div>
    </main>
  );
}
