"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { filterTranscriptEvents, paginateItems } from "@/src/features/historyFilters";
import {
  parseTranscriptQueryState,
  toTranscriptSearchParams,
} from "@/src/features/historyQueryState";
import { formatId, formatTime } from "@/src/lib/format";

const PAGE_SIZE = 10;

function TranscriptsPageContent() {
  const t = useTranslations("transcripts");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedState = useMemo(() => parseTranscriptQueryState(searchParams), [searchParams]);

  const agents = trpc.agent.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [agentId, setAgentId] = useState(parsedState.agentId);
  const [sessionId, setSessionId] = useState(parsedState.sessionId);
  const [limit, setLimit] = useState(parsedState.limit);
  const [query, setQuery] = useState(parsedState.query);
  const [typeFilter, setTypeFilter] = useState<
    | "all"
    | "user_message"
    | "assistant_message"
    | "tool_call"
    | "compaction"
    | "memory_flush"
    | "system"
  >(parsedState.typeFilter);
  const [page, setPage] = useState(parsedState.page);

  const sessionList = trpc.session.list.useQuery(
    { agentId, limit: 30 },
    { enabled: Boolean(agentId), refetchOnWindowFocus: false },
  );

  const transcripts = trpc.transcript.list.useQuery(
    { agentId, sessionId, limit },
    { enabled: Boolean(agentId && sessionId) },
  );

  const filteredEvents = useMemo(
    () =>
      filterTranscriptEvents(transcripts.data ?? [], {
        query,
        type: typeFilter,
      }),
    [transcripts.data, query, typeFilter],
  );

  const paged = useMemo(
    () =>
      paginateItems(filteredEvents, {
        page,
        pageSize: PAGE_SIZE,
      }),
    [filteredEvents, page],
  );

  useEffect(() => {
    if (parsedState.agentId) {
      setAgentId((prev) => (prev === parsedState.agentId ? prev : parsedState.agentId));
    }
    if (parsedState.sessionId) {
      setSessionId((prev) => (prev === parsedState.sessionId ? prev : parsedState.sessionId));
    }
    setLimit((prev) => (prev === parsedState.limit ? prev : parsedState.limit));
    setQuery((prev) => (prev === parsedState.query ? prev : parsedState.query));
    setTypeFilter((prev) => (prev === parsedState.typeFilter ? prev : parsedState.typeFilter));
    setPage((prev) => (prev === parsedState.page ? prev : parsedState.page));
  }, [parsedState]);

  useEffect(() => {
    if (!agentId && (agents.data?.length ?? 0) > 0) {
      setAgentId(agents.data![0]!.id);
    }
  }, [agentId, agents.data]);

  useEffect(() => {
    if (!sessionId && (sessionList.data?.length ?? 0) > 0) {
      setSessionId(sessionList.data![0]!.id);
    }
  }, [sessionId, sessionList.data]);

  useEffect(() => {
    if (page !== paged.page) {
      setPage(paged.page);
    }
  }, [page, paged.page]);

  useEffect(() => {
    const next = toTranscriptSearchParams({
      agentId,
      sessionId,
      query,
      typeFilter,
      limit,
      page,
    }).toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [agentId, sessionId, query, typeFilter, limit, page, pathname, router, searchParams]);

  const hasAgents = (agents.data?.length ?? 0) > 0;
  const hasSessions = (sessionList.data?.length ?? 0) > 0;

  return (
    <DashboardShell title={t("title")} description={t("description")}>
      <div className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Agent</Label>
            <Select
              value={agentId || undefined}
              onValueChange={(value) => {
                setAgentId(value);
                setSessionId("");
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={agents.isLoading ? "加载中..." : "选择 Agent"} />
              </SelectTrigger>
              <SelectContent>
                {(agents.data ?? []).map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>会话</Label>
            <Select
              value={sessionId || undefined}
              onValueChange={(value) => {
                setSessionId(value);
                setPage(1);
              }}
              disabled={!agentId || sessionList.isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={sessionList.isLoading ? "加载会话..." : "选择会话"} />
              </SelectTrigger>
              <SelectContent>
                {(sessionList.data ?? []).map((session) => (
                  <SelectItem key={session.id} value={session.id}>
                    {session.sessionKey}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>事件类型</Label>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(value as typeof typeFilter);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="事件类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部事件</SelectItem>
                <SelectItem value="user_message">user_message</SelectItem>
                <SelectItem value="assistant_message">assistant_message</SelectItem>
                <SelectItem value="tool_call">tool_call</SelectItem>
                <SelectItem value="compaction">compaction</SelectItem>
                <SelectItem value="memory_flush">memory_flush</SelectItem>
                <SelectItem value="system">system</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="transcript-search">搜索</Label>
            <Input
              id="transcript-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索内容"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>条数</Label>
            <Select
              value={String(limit)}
              onValueChange={(value) => {
                setLimit(Number(value));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50 条</SelectItem>
                <SelectItem value="100">100 条</SelectItem>
                <SelectItem value="200">200 条</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            onClick={() => transcripts.refetch()}
            disabled={!agentId || !sessionId}
          >
            刷新
          </Button>
        </div>

        {/* Stats */}
        {agentId && sessionId ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>共 {filteredEvents.length} 条</span>
            <span>
              第 {paged.page}/{paged.totalPages || 1} 页
            </span>
          </div>
        ) : null}

        {/* Event list */}
        <div className="space-y-3">
          {transcripts.isLoading
            ? Array.from({ length: 4 }).map((_, idx) => (
                <Card key={`loading-${idx}`}>
                  <CardContent className="py-4">
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))
            : paged.items.map((event) => (
                <Card key={event.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="py-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {event.type}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default font-mono text-xs text-muted-foreground">
                            {formatId(event.id)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-mono text-xs">{event.id}</p>
                        </TooltipContent>
                      </Tooltip>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(event.createdAt)}
                      </span>
                    </div>
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-3 text-xs">
                      {JSON.stringify(event.content, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              ))}

          {!transcripts.isLoading && agentId && sessionId && paged.items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              没有符合筛选条件的 transcript。
            </div>
          ) : null}

          {!transcripts.isLoading && !hasAgents ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              你还没有 Agent。先去{" "}
              <Link href="/agents" className="text-primary underline underline-offset-4">
                Agents
              </Link>{" "}
              创建一个。
            </div>
          ) : null}

          {!transcripts.isLoading && hasAgents && !hasSessions ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              这个 Agent 还没有会话，先去{" "}
              <Link href={`/chat/${agentId}`} className="text-primary underline underline-offset-4">
                Chat
              </Link>{" "}
              发一条消息。
            </div>
          ) : null}
        </div>

        {/* Pagination */}
        {paged.totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paged.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={paged.page >= paged.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </Button>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

export default function TranscriptsPage() {
  const t = useTranslations("transcripts");
  return (
    <Suspense
      fallback={
        <DashboardShell title={t("title")} description={t("description")}>
          <div className="mx-auto w-full max-w-4xl space-y-3 px-4 py-6 sm:px-6">
            {Array.from({ length: 4 }).map((_, idx) => (
              <Card key={`transcripts-page-fallback-${idx}`}>
                <CardContent className="py-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </DashboardShell>
      }
    >
      <TranscriptsPageContent />
    </Suspense>
  );
}
