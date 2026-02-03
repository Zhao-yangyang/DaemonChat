"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import { Button, Card, Input } from "@daemon/ui";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatTurn = trpc.chat.turn.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.assistantText }]);
    },
  });

  const send = () => {
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    chatTurn.mutate({ agentId, sessionKey: "main", userInput: userMessage, system: "" });
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
        <Button onClick={send} disabled={chatTurn.isPending}>
          发送
        </Button>
      </div>
    </main>
  );
}
