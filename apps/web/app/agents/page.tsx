"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@daemon/hooks";
import { Button, Card, Input } from "@daemon/ui";

export default function AgentsPage() {
  const [name, setName] = useState("");
  const agents = trpc.agent.list.useQuery();
  const createAgent = trpc.agent.create.useMutation({
    onSuccess: () => {
      setName("");
      agents.refetch();
    },
  });

  return (
    <main>
      <h2>Agents</h2>
      <Card>
        <div style={{ display: "flex", gap: 12 }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
          <Button
            onClick={() => createAgent.mutate({ name })}
            disabled={!name || createAgent.isPending}
          >
            创建
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {agents.data?.map((agent) => (
          <Card key={agent.id}>
            <strong>{agent.name}</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 12 }}>
              <Link href={`/chat/${agent.id}`}>聊天</Link>
            </div>
          </Card>
        ))}
        {agents.isLoading && <p>加载中...</p>}
      </div>
    </main>
  );
}
