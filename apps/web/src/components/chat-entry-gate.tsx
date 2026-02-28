"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@daemon/ui";

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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">加载失败</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription>加载 Agent 失败：{agents.error.message}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => agents.refetch()}>
              重试
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">前往 Agents</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (createAgent.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">初始化失败</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertDescription>自动初始化失败：{createAgent.error.message}</AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => createAgent.mutate({ name: "Default Agent" })}>
              重试初始化
            </Button>
            <Button asChild variant="outline">
              <Link href="/agents">手动创建 Agent</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">正在进入聊天</CardTitle>
        <CardDescription>正在获取最近 Agent 会话...</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </CardContent>
    </Card>
  );
}
