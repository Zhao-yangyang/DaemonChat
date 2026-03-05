"use client";

import { useState, useEffect } from "react";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@daemon/ui";
import { Star } from "lucide-react";
import { formatTime } from "@/src/lib/format";

interface TemplateDetailDialogProps {
  templateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloneClick?: (template: {
    id: string;
    name: string;
    description?: string | null;
    config: Record<string, unknown>;
  }) => void;
}

function systemPromptSummary(config: Record<string, unknown>): string {
  const sp = config?.systemPrompt;
  if (typeof sp !== "string" || !sp.trim()) return "（未配置）";
  const s = sp.trim();
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

function configPreview(config: Record<string, unknown>): {
  model?: string;
  memoryTopK?: number;
  recentMessages?: number;
} {
  const lp = config?.llmProvider as Record<string, unknown> | undefined;
  const model = lp && typeof lp.model === "string" ? lp.model : undefined;
  const memoryTopK = typeof config?.memoryTopK === "number" ? config.memoryTopK : undefined;
  const recentMessages = typeof config?.recentMessages === "number" ? config.recentMessages : undefined;
  return { model, memoryTopK, recentMessages };
}

export function TemplateDetailDialog({
  templateId,
  open,
  onOpenChange,
  onCloneClick,
}: TemplateDetailDialogProps) {
  const utils = trpc.useUtils();
  const [optimisticRating, setOptimisticRating] = useState<number | null>(null);

  const { data: template, isLoading, error } = trpc.template.get.useQuery(
    { templateId: templateId ?? "" },
    { enabled: open && Boolean(templateId) }
  );

  useEffect(() => {
    if (!open || !templateId) {
      setOptimisticRating(null);
    }
  }, [open, templateId]);

  const rateMutation = trpc.template.rate.useMutation({
    onSuccess: (_, variables) => {
      utils.template.get.setData(
        { templateId: variables.templateId },
        (prev: { myRating?: number | null; avgRating?: number | null; ratingCount?: number } | undefined) => {
          if (!prev) return prev;
          const count = prev.ratingCount ?? 0;
          const oldSum = (prev.avgRating ?? 0) * count;
          const prevRating = prev.myRating ?? 0;
          const hadPrevious = prev.myRating != null;
          const newCount = hadPrevious ? count : count + 1;
          const newSum = hadPrevious ? oldSum - prevRating + variables.rating : oldSum + variables.rating;
          const newAvg = newCount > 0 ? Math.round((newSum / newCount) * 10) / 10 : variables.rating;
          return {
            ...prev,
            myRating: variables.rating,
            avgRating: newAvg,
            ratingCount: newCount,
          };
        }
      );
      utils.template.list.invalidate();
    },
  });

  const handleRate = (rating: number) => {
    if (!templateId) return;
    setOptimisticRating(rating);
    rateMutation.mutate({ templateId, rating });
  };

  const displayedRating =
    optimisticRating ?? (rateMutation.isPending && rateMutation.variables ? rateMutation.variables.rating : null) ?? template?.myRating ?? null;

  const handleClone = () => {
    if (!template || !onCloneClick) return;
    onOpenChange(false);
    onCloneClick({
      id: template.id,
      name: template.name,
      description: template.description,
      config: template.config ?? {},
    });
  };

  if (!templateId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? "模板详情" : error ? "加载失败" : template?.name ?? "模板详情"}
          </DialogTitle>
          <DialogDescription>
            {isLoading ? "加载中..." : error ? (error.message || "加载失败") : template?.description ?? "模板配置预览与评分"}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : error ? (
          <div className="py-8 text-center text-destructive">
            {error.message || "加载失败"}
          </div>
        ) : template ? (
          <>
            <div className="flex flex-wrap items-center gap-2 -mt-2">
              {template.is_public ? (
                <Badge variant="secondary">公开</Badge>
              ) : (
                <Badge variant="outline">私有</Badge>
              )}
            </div>

            <div className="space-y-4 py-4">
              {(template.tags ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {template.tags!.map((tag: { id: string; name: string }) => (
                    <Badge key={tag.id} variant="outline">
                      {tag.name}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>
                  克隆 {template.clone_count} 次
                </span>
                <span>
                  {template.avgRating != null
                    ? `平均 ${Number(template.avgRating).toFixed(1)} 分`
                    : "暂无评分"}
                  {template.ratingCount != null && template.ratingCount > 0
                    ? `（${template.ratingCount} 人）`
                    : null}
                </span>
                <span>{formatTime(template.created_at)}</span>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">配置预览</p>
                <div className="rounded-md border bg-muted/50 p-3 text-sm">
                  <p className="mb-2 text-muted-foreground">System Prompt 摘要：</p>
                  <p className="whitespace-pre-wrap warp-break-words">
                    {systemPromptSummary(template.config ?? {})}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {(() => {
                      const { model, memoryTopK, recentMessages } = configPreview(
                        template.config ?? {}
                      );
                      return (
                        <>
                          {model ? <span>模型：{model}</span> : null}
                          {memoryTopK != null ? <span>Memory TopK：{memoryTopK}</span> : null}
                          {recentMessages != null ? (
                            <span>RecentMessages：{recentMessages}</span>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">评分</p>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className="rounded p-0.5 transition-colors hover:bg-muted"
                      onClick={() => handleRate(r)}
                      disabled={rateMutation.isPending}
                      aria-label={`${r} 星`}
                    >
                      <Star
                        className={`size-8 ${
                          (displayedRating ?? 0) >= r
                            ? "fill-amber-400 text-amber-500"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {displayedRating != null
                      ? `你已评 ${displayedRating} 星`
                      : "点击评分"}
                  </span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              {onCloneClick ? (
                <Button onClick={handleClone}>克隆使用</Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
