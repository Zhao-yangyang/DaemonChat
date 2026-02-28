"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@daemon/hooks";
import { Button, Card } from "@daemon/ui";

export function ChatEntryGate() {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const createAttemptedRef = useRef(false);

  const agents = trpc.agent.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createAgent = trpc.agent.create.useMutation({
    onSuccess: (agent) => {
      redirectedRef.current = true;
      router.replace(`/chat/${agent.id}`);
    },
  });

  useEffect(() => {
    if (redirectedRef.current) {
      return;
    }

    if (agents.isLoading || createAgent.isPending) {
      return;
    }

    const firstAgent = agents.data?.[0];
    if (firstAgent) {
      redirectedRef.current = true;
      router.replace(`/chat/${firstAgent.id}`);
      return;
    }

    if (agents.isFetched && !agents.error && !createAttemptedRef.current) {
      createAttemptedRef.current = true;
      createAgent.mutate({ name: "Default Agent" });
    }
  }, [agents.data, agents.error, agents.isFetched, agents.isLoading, createAgent, createAgent.isPending, router]);

  if (agents.error) {
    return (
      <Card className="space-y-3 border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700">加载 Agent 失败：{agents.error.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-rose-200 bg-white" onClick={() => agents.refetch()}>
            重试
          </Button>
          <Button asChild variant="outline" className="border-rose-200 bg-white">
            <Link href="/agents">前往 Agents</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (createAgent.error) {
    return (
      <Card className="space-y-3 border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700">自动初始化失败：{createAgent.error.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="border-rose-200 bg-white"
            onClick={() => createAgent.mutate({ name: "Default Agent" })}
          >
            重试初始化
          </Button>
          <Button asChild variant="outline" className="border-rose-200 bg-white">
            <Link href="/agents">手动创建 Agent</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-[var(--line-soft)] bg-white p-4 text-sm text-[var(--ink-muted)]">
      正在打开聊天空间...
    </Card>
  );
}
