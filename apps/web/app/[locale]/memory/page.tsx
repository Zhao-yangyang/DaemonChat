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
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { filterMemoryItems, paginateItems } from "@/src/features/historyFilters";
import {
  parseMemoryQueryState,
  toMemorySearchParams,
} from "@/src/features/historyQueryState";
import { useSession } from "@/src/hooks/use-session";

const PAGE_SIZE = 8;

function MemoryPageContent() {
  const t = useTranslations("memory");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parsedState = useMemo(() => parseMemoryQueryState(searchParams), [searchParams]);
  const { user } = useSession();

  const agents = trpc.agent.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [agentId, setAgentId] = useState(parsedState.agentId);
  const [content, setContent] = useState("");
  const [query, setQuery] = useState(parsedState.query);
  const [sensitivityFilter, setSensitivityFilter] = useState<
    "all" | "public" | "private" | "secret"
  >(parsedState.sensitivityFilter);
  const [eligibilityFilter, setEligibilityFilter] = useState<
    "all" | "eligible" | "ineligible"
  >(parsedState.eligibilityFilter);
  const [page, setPage] = useState(parsedState.page);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingTags, setEditingTags] = useState("");
  const [editingSensitivity, setEditingSensitivity] = useState<"public" | "private" | "secret">(
    "public"
  );
  const [editingEligibility, setEditingEligibility] = useState<"eligible" | "ineligible">(
    "eligible"
  );

  const userId = user?.id ?? "";

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
  const updateMemory = trpc.memory.update.useMutation({
    onSuccess: () => {
      setEditingMemoryId(null);
      setEditingContent("");
      setEditingTags("");
      memoryList.refetch();
    },
  });
  const deleteMemory = trpc.memory.delete.useMutation({
    onSuccess: () => {
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
    if (parsedState.agentId) {
      setAgentId((prev) => (prev === parsedState.agentId ? prev : parsedState.agentId));
    }
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
    if (!agentId && (agents.data?.length ?? 0) > 0) {
      setAgentId(agents.data![0]!.id);
    }
  }, [agentId, agents.data]);

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
  }, [agentId, query, sensitivityFilter, eligibilityFilter, page, pathname, router, searchParams]);

  const hasAgents = (agents.data?.length ?? 0) > 0;

  const beginEdit = (item: {
    id: string;
    content: string;
    tags: string[];
    sensitivity: "public" | "private" | "secret";
    contextEligible: boolean;
  }) => {
    setEditingMemoryId(item.id);
    setEditingContent(item.content);
    setEditingTags(item.tags.join(", "));
    setEditingSensitivity(item.sensitivity);
    setEditingEligibility(item.contextEligible ? "eligible" : "ineligible");
  };

  const cancelEdit = () => {
    setEditingMemoryId(null);
    setEditingContent("");
    setEditingTags("");
  };

  const saveEdit = async () => {
    if (!agentId || !editingMemoryId || !editingContent.trim()) return;
    await updateMemory.mutateAsync({
      agentId,
      memoryId: editingMemoryId,
      content: editingContent.trim(),
      tags: editingTags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      sensitivity: editingSensitivity,
      contextEligible: editingEligibility === "eligible",
    });
  };

  const removeMemory = async (memoryId: string) => {
    if (!agentId) return;
    const confirmed = window.confirm("确认删除这条记忆吗？");
    if (!confirmed) return;
    await deleteMemory.mutateAsync({ agentId, memoryId });
  };

  return (
    <DashboardShell
      title={t("title")}
      description={t("description")}
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        {/* Filters */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Agent</Label>
            <Select value={agentId || undefined} onValueChange={(value) => setAgentId(value)}>
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
            <Label htmlFor="memory-search">搜索</Label>
            <Input
              id="memory-search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="按内容或标签搜索"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>敏感级别</Label>
            <Select
              value={sensitivityFilter}
              onValueChange={(value) => {
                setSensitivityFilter(value as "all" | "public" | "private" | "secret");
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="敏感级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部敏感级别</SelectItem>
                <SelectItem value="public">public</SelectItem>
                <SelectItem value="private">private</SelectItem>
                <SelectItem value="secret">secret</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>上下文可用性</Label>
            <Select
              value={eligibilityFilter}
              onValueChange={(value) => {
                setEligibilityFilter(value as "all" | "eligible" | "ineligible");
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="上下文可用性" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="eligible">eligible</SelectItem>
                <SelectItem value="ineligible">ineligible</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Create memory */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">新增记忆</CardTitle>
            <CardDescription>写入当前 Agent 可复用的事实。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="memory-content">记忆内容</Label>
              <Input
                id="memory-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="记录一条可复用事实，例如：偏好英文输出"
              />
            </div>
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
          </CardContent>
        </Card>

        {/* Stats bar */}
        {agentId ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>共 {filteredItems.length} 条</span>
            <span>第 {paged.page}/{paged.totalPages || 1} 页</span>
          </div>
        ) : null}

        {/* Memory list */}
        <div className="space-y-3">
          {memoryList.isLoading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <Card key={`loading-${idx}`}>
                  <CardContent className="py-4">
                    <Skeleton className="h-12 w-full" />
                  </CardContent>
                </Card>
              ))
            : paged.items.map((item) => (
                <Card key={item.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="py-4">
                    {editingMemoryId === item.id ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label>内容</Label>
                          <Textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="min-h-20"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label>标签（逗号分隔）</Label>
                            <Input
                              value={editingTags}
                              onChange={(e) => setEditingTags(e.target.value)}
                              placeholder="例如：偏好, 输出"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>敏感级别</Label>
                            <Select
                              value={editingSensitivity}
                              onValueChange={(value) =>
                                setEditingSensitivity(value as "public" | "private" | "secret")
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="public">public</SelectItem>
                                <SelectItem value="private">private</SelectItem>
                                <SelectItem value="secret">secret</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>上下文可用性</Label>
                            <Select
                              value={editingEligibility}
                              onValueChange={(value) =>
                                setEditingEligibility(value as "eligible" | "ineligible")
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="eligible">eligible</SelectItem>
                                <SelectItem value="ineligible">ineligible</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button size="xs" variant="secondary" onClick={cancelEdit}>
                            取消
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => void saveEdit()}
                            disabled={updateMemory.isPending || !editingContent.trim()}
                          >
                            {updateMemory.isPending ? "保存中..." : "保存"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{item.content}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs">{item.type}</Badge>
                          <Badge variant="secondary" className="text-xs">{item.sensitivity}</Badge>
                          <Badge variant={item.contextEligible ? "default" : "secondary"} className="text-xs">
                            {item.contextEligible ? "eligible" : "ineligible"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() =>
                              beginEdit({
                                id: item.id,
                                content: item.content,
                                tags: item.tags,
                                sensitivity: item.sensitivity,
                                contextEligible: item.contextEligible,
                              })
                            }
                          >
                            编辑
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            disabled={deleteMemory.isPending}
                            onClick={() => void removeMemory(item.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}

          {!memoryList.isLoading && agentId && paged.items.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              没有符合筛选条件的记忆。
            </div>
          ) : null}

          {!memoryList.isLoading && !hasAgents ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              你还没有 Agent。先去{" "}
              <Link href="/agents" className="text-primary underline underline-offset-4">Agents</Link>
              {" "}创建一个。
            </div>
          ) : null}
        </div>

        {/* Pagination */}
        {paged.totalPages > 1 ? (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" disabled={paged.page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <Button variant="outline" size="sm" disabled={paged.page >= paged.totalPages} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

export default function MemoryPage() {
  const t = useTranslations("memory");
  return (
    <Suspense
      fallback={
        <DashboardShell title={t("title")} description={t("description")}>
          <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-6 sm:px-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <Card key={`memory-page-fallback-${idx}`}>
                <CardContent className="py-4">
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </DashboardShell>
      }
    >
      <MemoryPageContent />
    </Suspense>
  );
}
