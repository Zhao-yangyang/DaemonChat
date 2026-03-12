"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  Input,
  Label,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@daemon/ui";
import { Search, Sparkles, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { useSession } from "@/src/hooks/use-session";
import { MemoryCreateForm } from "@/src/components/memory/memory-create-form";
import { MemoryItemCard } from "@/src/components/memory/memory-item-card";
import type { MemoryItemEditState } from "@/src/components/memory/memory-item-card";

const PAGE_SIZE = 12;
const MEMORY_TYPES = ["fact", "rule", "preference", "task"] as const;
const SENSITIVITY_OPTIONS = ["public", "private", "secret"] as const;

type MemoryType = (typeof MEMORY_TYPES)[number];
type Sensitivity = (typeof SENSITIVITY_OPTIONS)[number];

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  rule: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  preference: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  task: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

function MemoryPageContent() {
  const t = useTranslations("memory");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const userId = user?.id ?? "";

  const [agentId, setAgentId] = useState(searchParams.get("agent") ?? "");
  const [searchMode, setSearchMode] = useState<"list" | "semantic">("list");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");
  const [sensitivityFilter, setSensitivityFilter] = useState<Sensitivity | "all">("all");
  const [page, setPage] = useState(1);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createContent, setCreateContent] = useState("");
  const [createType, setCreateType] = useState<MemoryType>("fact");
  const [createTags, setCreateTags] = useState("");
  const [createSensitivity, setCreateSensitivity] = useState<Sensitivity>("public");
  const [createEligible, setCreateEligible] = useState(true);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState<MemoryItemEditState>({
    content: "",
    tags: "",
    sensitivity: "public",
    contextEligible: true,
  });
  // Delete confirm dialog
  const [deleteMemoryId, setDeleteMemoryId] = useState<string | null>(null);

  // i18n label helpers (inside component to access t())
  const getTypeLabel = (type: MemoryType): string => {
    const map: Record<MemoryType, string> = {
      fact: t("typeFact"),
      rule: t("typeRule"),
      preference: t("typePreference"),
      task: t("typeTask"),
    };
    return map[type] ?? type;
  };

  const getSensitivityLabel = (s: Sensitivity): string => {
    const map: Record<Sensitivity, string> = {
      public: t("sensitivityPublic"),
      private: t("sensitivityPrivate"),
      secret: t("sensitivitySecret"),
    };
    return map[s] ?? s;
  };

  const agents = trpc.agent.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const offset = (page - 1) * PAGE_SIZE;
  const memoryList = trpc.memory.list.useQuery(
    {
      agentId,
      limit: PAGE_SIZE,
      offset,
      type: typeFilter === "all" ? undefined : typeFilter,
      sensitivity: sensitivityFilter === "all" ? undefined : sensitivityFilter,
    },
    { enabled: Boolean(agentId) && searchMode === "list" },
  );

  const semanticSearch = trpc.memory.search.useQuery(
    { agentId, query, topK: 20 },
    { enabled: Boolean(agentId) && searchMode === "semantic" && query.length >= 2 },
  );

  const memoryCount = trpc.memory.count.useQuery({ agentId }, { enabled: Boolean(agentId) });

  const createMemory = trpc.memory.create.useMutation({
    onSuccess: () => {
      setCreateContent("");
      setCreateTags("");
      setShowCreate(false);
      memoryList.refetch();
      memoryCount.refetch();
    },
  });
  const updateMemory = trpc.memory.update.useMutation({
    onSuccess: () => {
      setEditId(null);
      memoryList.refetch();
    },
  });
  const deleteMemory = trpc.memory.delete.useMutation({
    onSuccess: () => {
      memoryList.refetch();
      memoryCount.refetch();
    },
  });

  useEffect(() => {
    if (!agentId && (agents.data?.length ?? 0) > 0) {
      setAgentId(agents.data![0]!.id);
    }
  }, [agentId, agents.data]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (agentId) next.set("agent", agentId);
    const nextStr = next.toString();
    const currentStr = searchParams.toString();
    if (nextStr !== currentStr) {
      router.replace(nextStr ? `${pathname}?${nextStr}` : pathname, { scroll: false });
    }
  }, [agentId, pathname, router, searchParams]);

  const isLoading = searchMode === "semantic" ? semanticSearch.isLoading : memoryList.isLoading;
  const hasAgents = (agents.data?.length ?? 0) > 0;

  const displayItems = useMemo(() => {
    const items = searchMode === "semantic" ? (semanticSearch.data ?? []) : (memoryList.data ?? []);
    if (searchMode === "semantic" || !query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.content.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [searchMode, semanticSearch.data, memoryList.data, query]);

  const stats = memoryCount.data;
  const hasMore = searchMode === "list" && (memoryList.data?.length ?? 0) >= PAGE_SIZE;

  const beginEdit = (item: {
    id: string;
    content: string;
    tags: string[];
    sensitivity: Sensitivity;
    contextEligible: boolean;
  }) => {
    setEditId(item.id);
    setEditState({
      content: item.content,
      tags: item.tags.join(", "),
      sensitivity: item.sensitivity,
      contextEligible: item.contextEligible,
    });
  };

  return (
    <DashboardShell title={t("title")} description={t("description")}>
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        {/* Agent selector + stats */}
        <div className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label>Agent</Label>
            <Select
              value={agentId || undefined}
              onValueChange={(v) => {
                setAgentId(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={agents.isLoading ? t("loading") : t("selectAgent")} />
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
          {stats && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              <Badge variant="secondary" className="text-xs font-normal">
                {t("statsTotal", { total: stats.total })}
              </Badge>
              {MEMORY_TYPES.map((mt) =>
                (stats.byType[mt] ?? 0) > 0 ? (
                  <Badge
                    key={mt}
                    variant="secondary"
                    className={`text-xs font-normal ${TYPE_COLORS[mt]}`}
                  >
                    {getTypeLabel(mt)} {stats.byType[mt]}
                  </Badge>
                ) : null,
              )}
            </div>
          )}
        </div>

        {/* Search bar + filters */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              {searchMode === "semantic" ? (
                <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              ) : (
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              )}
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={
                  searchMode === "semantic"
                    ? t("semanticSearchPlaceholder")
                    : t("textSearchPlaceholder")
                }
                className="pl-9"
              />
            </div>
            <Button
              variant={searchMode === "semantic" ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => setSearchMode(searchMode === "semantic" ? "list" : "semantic")}
              title={t("toggleSemantic")}
            >
              <Sparkles className="mr-1 size-4" />
              {t("semanticBtn")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setShowCreate(!showCreate)}
              data-testid="memory-add-btn"
            >
              <Plus className="mr-1 size-4" />
              {t("addBtn")}
            </Button>
          </div>

          {searchMode === "list" && (
            <div className="flex flex-wrap gap-2">
              <Select
                value={typeFilter}
                onValueChange={(v) => {
                  setTypeFilter(v as MemoryType | "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder={t("typeLabel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allTypes")}</SelectItem>
                  {MEMORY_TYPES.map((mt) => (
                    <SelectItem key={mt} value={mt}>
                      {getTypeLabel(mt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sensitivityFilter}
                onValueChange={(v) => {
                  setSensitivityFilter(v as Sensitivity | "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder={t("sensitivityLabel")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allSensitivity")}</SelectItem>
                  {SENSITIVITY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getSensitivityLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <MemoryCreateForm
            agentId={agentId}
            userId={userId}
            content={createContent}
            type={createType}
            tags={createTags}
            sensitivity={createSensitivity}
            contextEligible={createEligible}
            isPending={createMemory.isPending}
            getTypeLabel={getTypeLabel}
            getSensitivityLabel={getSensitivityLabel}
            onContentChange={setCreateContent}
            onTypeChange={setCreateType}
            onTagsChange={setCreateTags}
            onSensitivityChange={setCreateSensitivity}
            onContextEligibleChange={setCreateEligible}
            onSubmit={() =>
              createMemory.mutate({
                agentId,
                scopeType: "user",
                scopeId: userId,
                type: createType,
                content: createContent,
                tags: createTags
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                sensitivity: createSensitivity,
                contextEligible: createEligible,
              })
            }
          />
        )}

        {/* Memory list */}
        <div className="space-y-2" data-testid="memory-list">
          {isLoading
            ? Array.from({ length: 3 }).map((_, idx) => (
                <Card key={`skel-${idx}`}>
                  <CardContent className="py-3">
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))
            : displayItems.map((item) => (
                <MemoryItemCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  isEditing={editId === item.id}
                  editState={editState}
                  isSavePending={updateMemory.isPending}
                  isDeletePending={deleteMemory.isPending}
                  getTypeLabel={getTypeLabel}
                  getSensitivityLabel={getSensitivityLabel}
                  onEditStart={() =>
                    beginEdit({
                      id: item.id,
                      content: item.content,
                      tags: item.tags,
                      sensitivity: item.sensitivity as Sensitivity,
                      contextEligible: item.contextEligible,
                    })
                  }
                  onEditCancel={() => setEditId(null)}
                  onEditChange={(patch) => setEditState((prev) => ({ ...prev, ...patch }))}
                  onEditSave={() =>
                    updateMemory.mutate({
                      agentId,
                      memoryId: item.id,
                      content: editState.content.trim(),
                      tags: editState.tags
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      sensitivity: editState.sensitivity,
                      contextEligible: editState.contextEligible,
                    })
                  }
                  onDeleteRequest={() => setDeleteMemoryId(item.id)}
                />
              ))}

          {!isLoading && agentId && displayItems.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {searchMode === "semantic" && query.length >= 2
                ? t("noSemanticResults")
                : t("noResults")}
            </div>
          )}

          {!isLoading && !hasAgents && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("noAgentsHint")}{" "}
              <Link href="/agents" className="text-primary underline underline-offset-4">
                Agents
              </Link>{" "}
              {t("noAgentsSuffix")}
            </div>
          )}
        </div>

        {/* Delete memory confirm dialog */}
        <Dialog
          open={Boolean(deleteMemoryId)}
          onOpenChange={(open) => {
            if (!open) setDeleteMemoryId(null);
          }}
        >
          <DialogContent className="sm:max-w-sm" data-testid="memory-delete-dialog">
            <DialogHeader>
              <DialogTitle>{t("delete")}</DialogTitle>
              <DialogDescription>{t("confirmDelete")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setDeleteMemoryId(null)}>
                {t("cancel")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteMemory.isPending}
                data-testid="memory-delete-confirm"
                onClick={() => {
                  if (deleteMemoryId) {
                    deleteMemory.mutate(
                      { agentId, memoryId: deleteMemoryId },
                      { onSettled: () => setDeleteMemoryId(null) },
                    );
                  }
                }}
              >
                {deleteMemory.isPending ? t("saving") : t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pagination (list mode only) */}
        {searchMode === "list" && (page > 1 || hasMore) && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 size-4" />
              {t("prevPage")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("pageInfo", { page })}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("nextPage")}
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        )}
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
              <Card key={`fallback-${idx}`}>
                <CardContent className="py-3">
                  <Skeleton className="h-10 w-full" />
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
