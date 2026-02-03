"use client";

import { useState } from "react";
import { trpc } from "@daemon/hooks";
import { Button, Card, Input } from "@daemon/ui";

export default function MemoryPage() {
  const [agentId, setAgentId] = useState("");
  const [content, setContent] = useState("");
  const memoryList = trpc.memory.list.useQuery(
    { agentId, limit: 50 },
    { enabled: Boolean(agentId) }
  );
  const createMemory = trpc.memory.create.useMutation({
    onSuccess: () => {
      setContent("");
      memoryList.refetch();
    },
  });

  return (
    <main>
      <h2>Memory</h2>
      <Card>
        <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Agent ID" />
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 12 }}>
          <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Memory content" />
          <Button
            onClick={() =>
              createMemory.mutate({
                agentId,
                scopeType: "user",
                scopeId: agentId,
                type: "fact",
                content,
                tags: [],
                sensitivity: "public",
                contextEligible: true,
              })
            }
            disabled={!agentId || !content}
          >
            保存
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {memoryList.data?.map((item) => (
          <Card key={item.id}>
            <p>{item.content}</p>
            <small>{item.sensitivity}</small>
          </Card>
        ))}
      </div>
    </main>
  );
}
