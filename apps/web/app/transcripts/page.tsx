"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { filterTranscriptEvents, paginateItems } from "@/src/features/historyFilters";
import {
  parseTranscriptQueryState,
  toTranscriptSearchParams,
} from "@/src/features/historyQueryState";

const PAGE_SIZE = 10;

export default function TranscriptsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedState = useMemo(() => parseTranscriptQueryState(searchParams), [searchParams]);

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

  const transcripts = trpc.transcript.list.useQuery(
    { agentId, sessionId, limit },
    { enabled: Boolean(agentId && sessionId) }
  );

  const filteredEvents = useMemo(
    () =>
      filterTranscriptEvents(transcripts.data ?? [], {
        query,
        type: typeFilter,
      }),
    [transcripts.data, query, typeFilter]
  );

  const paged = useMemo(
    () =>
      paginateItems(filteredEvents, {
        page,
        pageSize: PAGE_SIZE,
      }),
    [filteredEvents, page]
  );

  useEffect(() => {
    setAgentId((prev) => (prev === parsedState.agentId ? prev : parsedState.agentId));
    setSessionId((prev) => (prev === parsedState.sessionId ? prev : parsedState.sessionId));
    setLimit((prev) => (prev === parsedState.limit ? prev : parsedState.limit));
    setQuery((prev) => (prev === parsedState.query ? prev : parsedState.query));
    setTypeFilter((prev) => (prev === parsedState.typeFilter ? prev : parsedState.typeFilter));
    setPage((prev) => (prev === parsedState.page ? prev : parsedState.page));
  }, [parsedState]);

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

  return (
    <DashboardShell
      title="Transcripts"
      description="按类型与关键词回溯会话轨迹，定位上下文来源与异常路径。"
      actions={
        <Button asChild variant="outline" className="border-[var(--line-soft)] bg-white">
          <Link href="/chat">回到聊天</Link>
        </Button>
      }
    >
      <section className="space-y-4">
        <Card className="space-y-4 border-[var(--line-soft)] bg-white/92 p-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <Input
              value={agentId}
              onChange={(e) => {
                setAgentId(e.target.value);
                setPage(1);
              }}
              placeholder="Agent ID"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Input
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value);
                setPage(1);
              }}
              placeholder="Session ID"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Input
              value={limit}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                setLimit(Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1);
                setPage(1);
              }}
              placeholder="Limit"
              type="number"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="搜索内容"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                setTypeFilter(
                  value as
                    | "all"
                    | "user_message"
                    | "assistant_message"
                    | "tool_call"
                    | "compaction"
                    | "memory_flush"
                    | "system"
                );
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 border-[var(--line-soft)] bg-white">
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
            <Button onClick={() => transcripts.refetch()} disabled={!agentId || !sessionId}>
              加载
            </Button>
          </div>
        </Card>

        {agentId && sessionId ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink-muted)]">
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
              共 {filteredEvents.length} 条
            </Badge>
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
              第 {paged.page}/{paged.totalPages} 页
            </Badge>
          </div>
        ) : null}

        <div className="grid gap-3">
          {transcripts.isLoading
            ? Array.from({ length: 4 }).map((_, idx) => (
                <Card
                  key={`loading-${idx}`}
                  className="h-28 animate-pulse border-[var(--line-soft)] bg-white/70"
                />
              ))
            : paged.items.map((event) => (
                <Card
                  key={event.id}
                  className="space-y-3 border-[var(--line-soft)] bg-white/94 p-5 shadow-[0_10px_24px_rgba(24,38,64,0.05)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-[var(--line-soft)] bg-[var(--brand-soft)]">
                      {event.type}
                    </Badge>
                    <Badge variant="outline" className="border-[var(--line-soft)] bg-white">
                      {event.id}
                    </Badge>
                    <span className="text-xs text-[var(--ink-muted)]">{event.createdAt}</span>
                  </div>

                  <pre className="overflow-x-auto rounded-xl border border-[var(--line-soft)] bg-slate-50/90 p-3 text-xs text-slate-700">
                    {JSON.stringify(event.content, null, 2)}
                  </pre>
                </Card>
              ))}

          {!transcripts.isLoading && agentId && sessionId && paged.items.length === 0 ? (
            <Card className="border-[var(--line-soft)] bg-white/86 p-5 text-sm text-[var(--ink-muted)]">
              没有符合筛选条件的 transcript。
            </Card>
          ) : null}

          {!transcripts.isLoading && (!agentId || !sessionId) ? (
            <Card className="border-[var(--line-soft)] bg-white/86 p-5 text-sm text-[var(--ink-muted)]">
              先输入 Agent ID 和 Session ID。
            </Card>
          ) : null}
        </div>

        {paged.totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={paged.page <= 1}
              onClick={() => setPage((prev) => prev - 1)}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              disabled={paged.page >= paged.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
            >
              下一页
            </Button>
          </div>
        ) : null}
      </section>
    </DashboardShell>
  );
}
