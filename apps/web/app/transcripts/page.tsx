"use client";

import { useState } from "react";
import { trpc } from "@daemon/hooks";
import { Button, Card, Input } from "@daemon/ui";

export default function TranscriptsPage() {
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [limit, setLimit] = useState(50);

  const transcripts = trpc.transcript.list.useQuery(
    { agentId, sessionId, limit },
    { enabled: Boolean(agentId && sessionId) }
  );

  return (
    <main>
      <h2>Transcripts</h2>
      <Card>
        <div style={{ display: "grid", gap: 12 }}>
          <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Agent ID" />
          <Input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Session ID" />
          <Input
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            placeholder="Limit"
            type="number"
          />
          <Button onClick={() => transcripts.refetch()} disabled={!agentId || !sessionId}>
            加载
          </Button>
        </div>
      </Card>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {transcripts.data?.map((event) => (
          <Card key={event.id}>
            <strong>{event.type}</strong>
            <pre>{JSON.stringify(event.content, null, 2)}</pre>
            <small>{event.createdAt}</small>
          </Card>
        ))}
      </div>
    </main>
  );
}
