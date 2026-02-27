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
import { filterMemoryItems, paginateItems } from "@/src/features/historyFilters";
import {
  parseMemoryQueryState,
  toMemorySearchParams,
} from "@/src/features/historyQueryState";
import { supabaseBrowserClient } from "@/src/supabaseClient";

const PAGE_SIZE = 8;

export default function MemoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedState = useMemo(() => parseMemoryQueryState(searchParams), [searchParams]);

  const [agentId, setAgentId] = useState(parsedState.agentId);
  const [userId, setUserId] = useState("");
  const [content, setContent] = useState("");
  const [query, setQuery] = useState(parsedState.query);
  const [sensitivityFilter, setSensitivityFilter] = useState<
    "all" | "public" | "private" | "secret"
  >(parsedState.sensitivityFilter);
  const [eligibilityFilter, setEligibilityFilter] = useState<
    "all" | "eligible" | "ineligible"
  >(parsedState.eligibilityFilter);
  const [page, setPage] = useState(parsedState.page);

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

  const filteredItems = useMemo(
    () =>
      filterMemoryItems(memoryList.data ?? [], {
        query,
        sensitivity: sensitivityFilter,
        contextEligible: eligibilityFilter,
      }),
    [memoryList.data, query, sensitivityFilter, eligibilityFilter]
  );

  const paged = useMemo(
    () =>
      paginateItems(filteredItems, {
        page,
        pageSize: PAGE_SIZE,
      }),
    [filteredItems, page]
  );

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? "");
    });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? "");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setAgentId((prev) => (prev === parsedState.agentId ? prev : parsedState.agentId));
    setQuery((prev) => (prev === parsedState.query ? prev : parsedState.query));
    setSensitivityFilter((prev) =>
      prev === parsedState.sensitivityFilter ? prev : parsedState.sensitivityFilter
    );
    setEligibilityFilter((prev) =>
      prev === parsedState.eligibilityFilter ? prev : parsedState.eligibilityFilter
    );
    setPage((prev) => (prev === parsedState.page ? prev : parsedState.page));
  }, [parsedState]);

  useEffect(() => {
    if (page !== paged.page) {
      setPage(paged.page);
    }
  }, [page, paged.page]);

  useEffect(() => {
    const next = toMemorySearchParams({
      agentId,
      query,
      sensitivityFilter,
      eligibilityFilter,
      page,
    }).toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [
    agentId,
    query,
    sensitivityFilter,
    eligibilityFilter,
    page,
    pathname,
    router,
    searchParams,
  ]);

  return (
    <DashboardShell
      title="Memory 管理"
      description="查看与创建可检索记忆，控制敏感级别与上下文参与策略。"
      actions={
        <Button asChild variant="outline" className="border-[var(--line-soft)] bg-white">
          <Link href="/agents">返回 Agent 列表</Link>
        </Button>
      }
    >
      <section className="space-y-4">
        <Card className="space-y-4 border-[var(--line-soft)] bg-white/92 p-5">
          <div className="grid gap-3 lg:grid-cols-2">
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
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="按内容或标签搜索"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Select
              value={sensitivityFilter}
              onValueChange={(value) => {
                setSensitivityFilter(value as "all" | "public" | "private" | "secret");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 border-[var(--line-soft)] bg-white">
                <SelectValue placeholder="敏感级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部敏感级别</SelectItem>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="private">private</SelectItem>
                <SelectItem value="secret">secret</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={eligibilityFilter}
              onValueChange={(value) => {
                setEligibilityFilter(value as "all" | "eligible" | "ineligible");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-10 border-[var(--line-soft)] bg-white">
                <SelectValue placeholder="上下文可用性" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="eligible">eligible</SelectItem>
                <SelectItem value="ineligible">ineligible</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="space-y-3 border-[var(--line-soft)] bg-white/92 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-muted)]">Create Memory Item</p>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="记录一条可复用事实，例如：偏好英文输出"
              className="h-10 border-[var(--line-soft)] bg-white"
            />
            <Button
              onClick={() =>
                createMemory.mutate({
                  agentId,
                  scopeType: "user",
                  scopeId: userId,
                  type: "fact",
                  content,
                  tags: [],
                  sensitivity: "public",
                  contextEligible: true,
                })
              }
              disabled={!agentId || !content || !userId || createMemory.isPending}
            >
              {createMemory.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </Card>

        {agentId ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ink-muted)]">
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
              共 {filteredItems.length} 条
            </Badge>
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80">
              第 {paged.page}/{paged.totalPages} 页
            </Badge>
          </div>
        ) : null}

        <div className="grid gap-3">
          {memoryList.isLoading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <Card
                  key={`loading-${idx}`}
                  className="h-24 animate-pulse border-[var(--line-soft)] bg-white/75"
                />
              ))
            : paged.items.map((item) => (
                <Card
                  key={item.id}
                  className="space-y-3 border-[var(--line-soft)] bg-white/94 p-5 shadow-[0_10px_24px_rgba(24,38,64,0.05)]"
                >
                  <p className="text-sm leading-relaxed text-[var(--ink)]">{item.content}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-[var(--line-soft)] bg-white">
                      {item.type}
                    </Badge>
                    <Badge variant="outline" className="border-[var(--line-soft)] bg-white">
                      {item.sensitivity}
                    </Badge>
                    <Badge variant={item.contextEligible ? "secondary" : "outline"}>
                      {item.contextEligible ? "eligible" : "ineligible"}
                    </Badge>
                  </div>
                </Card>
              ))}

          {!memoryList.isLoading && agentId && paged.items.length === 0 ? (
            <Card className="border-[var(--line-soft)] bg-white/86 p-5 text-sm text-[var(--ink-muted)]">
              没有符合筛选条件的记忆。
            </Card>
          ) : null}

          {!memoryList.isLoading && !agentId ? (
            <Card className="border-[var(--line-soft)] bg-white/86 p-5 text-sm text-[var(--ink-muted)]">
              先输入 Agent ID 后再查看记忆。
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
