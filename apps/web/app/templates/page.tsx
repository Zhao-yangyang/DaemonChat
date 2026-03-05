"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { trpc } from "@daemon/hooks";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { CloneConfigDialog } from "@/src/components/clone-config-dialog";
import { TemplateDetailDialog } from "@/src/components/template-detail-dialog";
import { TemplateEditDialog } from "@/src/components/template-edit-dialog";
import { TemplateDeleteDialog } from "@/src/components/template-delete-dialog";
import { useSession } from "@/src/hooks/use-session";
import { formatTime } from "@/src/lib/format";
import { Pencil, Search, Star, Trash2 } from "lucide-react";

export default function TemplatesPage() {
  const { session, isResolved } = useSession();
  const [onlyMine, setOnlyMine] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDeleteTemplate, setEditDeleteTemplate] = useState<{
    id: string;
    name: string;
    description?: string | null;
    is_public: boolean;
    tags?: Array<{ id: string; name: string }>;
  } | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<{
    id: string;
    name: string;
    description?: string | null;
    config: Record<string, unknown>;
    tags?: Array<{ id: string; name: string }>;
    avgRating?: number | null;
    ratingCount?: number;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setKeyword(keywordInput), 300);
    return () => clearTimeout(t);
  }, [keywordInput]);

  const tags = trpc.template.listTags.useQuery(undefined, {
    enabled: Boolean(session),
    retry: false,
  });

  const templates = trpc.template.list.useQuery(
    { onlyMine, limit: 50, keyword: keyword || undefined, tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined },
    { enabled: Boolean(session), retry: false, refetchOnWindowFocus: false }
  );

  const openCloneDialog = (
    tpl: { id: string; name: string; description?: string | null; config: Record<string, unknown>; tags?: Array<{ id: string; name: string }>; avgRating?: number | null; ratingCount?: number }
  ) => {
    setSelectedTemplate(tpl);
    setCloneDialogOpen(true);
  };

  const openDetailDialog = (
    tpl: { id: string; name: string; description?: string | null; config: Record<string, unknown>; tags?: Array<{ id: string; name: string }>; avgRating?: number | null; ratingCount?: number }
  ) => {
    setSelectedTemplate(tpl);
    setDetailDialogOpen(true);
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  };

  const openEditDialog = (
    tpl: { id: string; name: string; description?: string | null; is_public: boolean; tags?: Array<{ id: string; name: string }> }
  ) => {
    setEditDeleteTemplate(tpl);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (
    tpl: { id: string; name: string; description?: string | null; is_public: boolean; tags?: Array<{ id: string; name: string }> }
  ) => {
    setEditDeleteTemplate(tpl);
    setDeleteDialogOpen(true);
  };

  const utils = trpc.useUtils();
  const onEditOrDeleteSuccess = () => {
    setEditDeleteTemplate(null);
    utils.template.list.invalidate();
  };

  if (!isResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardDescription>正在检查登录状态...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>模板市场</CardTitle>
            <CardDescription>请先登录再浏览模板。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-fit">
              <Link href="/">返回登录页</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell
      title="模板市场"
      description="浏览和克隆社区分享的 Agent 模板。"
      actions={
        <Button asChild variant="outline" size="sm">
          <a href="/agents">返回 Agent 列表</a>
        </Button>
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant={onlyMine ? "outline" : "default"}
                size="sm"
                onClick={() => setOnlyMine(false)}
              >
                全部模板
              </Button>
              <Button
                variant={onlyMine ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyMine(true)}
              >
                我的模板
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => templates.refetch()}
              disabled={templates.isFetching}
            >
              {templates.isFetching ? "刷新中..." : "刷新"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-search" className="text-xs text-muted-foreground">
              搜索
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tpl-search"
                placeholder="按名称或描述搜索..."
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          {tags.data && tags.data.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedTagIds.length === 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTagIds([])}
              >
                全部
              </Button>
              {tags.data.map((tag) => (
                <Button
                  key={tag.id}
                  variant={selectedTagIds.includes(tag.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleTag(tag.id)}
                >
                  {tag.name}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        {templates.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {templates.error.message || "加载模板列表失败，请稍后重试。"}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-3">
          {templates.isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={`tpl-loading-${i}`}>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))
            : (templates.data ?? []).map((tpl) => (
                <Card
                  key={tpl.id}
                  className="cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => openDetailDialog(tpl)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{tpl.name}</p>
                          {tpl.is_public ? (
                            <Badge variant="secondary">公开</Badge>
                          ) : (
                            <Badge variant="outline">私有</Badge>
                          )}
                          {(tpl.tags ?? []).map((tag) => (
                            <Badge key={tag.id} variant="outline" className="text-xs">
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                        {tpl.description ? (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {tpl.description}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-0.5">
                            <Star className="size-3 fill-amber-400 text-amber-500" />
                            {tpl.avgRating != null
                              ? `${Number(tpl.avgRating).toFixed(1)} (${tpl.ratingCount ?? 0} 人)`
                              : "暂无评分"}
                          </span>
                          <span>克隆 {tpl.clone_count} 次</span>
                          <span>{formatTime(tpl.created_at)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {onlyMine ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(tpl);
                              }}
                              aria-label="编辑"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-8 p-0 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteDialog(tpl);
                              }}
                              aria-label="删除"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        ) : null}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCloneDialog(tpl);
                          }}
                        >
                          克隆使用
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

          {!templates.isLoading && !templates.error && (templates.data?.length ?? 0) === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {onlyMine
                ? "你还没有发布过模板。前往 Agent 列表，点击「发布」将 Agent 分享为模板。"
                : "暂无模板。成为第一个分享 Agent 配置的人！"}
            </div>
          ) : null}
        </div>

        <CloneConfigDialog
          template={selectedTemplate}
          open={cloneDialogOpen}
          onOpenChange={setCloneDialogOpen}
        />

        <TemplateDetailDialog
          templateId={selectedTemplate?.id ?? null}
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          onCloneClick={(tpl) => {
            setSelectedTemplate(tpl);
            setDetailDialogOpen(false);
            setCloneDialogOpen(true);
          }}
        />

        {editDeleteTemplate ? (
          <TemplateEditDialog
            templateId={editDeleteTemplate.id}
            initialName={editDeleteTemplate.name}
            initialDescription={editDeleteTemplate.description ?? ""}
            initialIsPublic={editDeleteTemplate.is_public}
            initialTagIds={(editDeleteTemplate.tags ?? []).map((t) => t.id)}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onSuccess={onEditOrDeleteSuccess}
          />
        ) : null}

        {editDeleteTemplate ? (
          <TemplateDeleteDialog
            templateId={editDeleteTemplate.id}
            templateName={editDeleteTemplate.name}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onSuccess={onEditOrDeleteSuccess}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
