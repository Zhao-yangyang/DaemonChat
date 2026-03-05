"use client";

import { useEffect, useState } from "react";
import { trpc } from "@daemon/hooks";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@daemon/ui";

interface TemplateEditDialogProps {
  templateId: string | null;
  initialName: string;
  initialDescription: string;
  initialIsPublic: boolean;
  initialTagIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TemplateEditDialog({
  templateId,
  initialName,
  initialDescription,
  initialIsPublic,
  initialTagIds,
  open,
  onOpenChange,
  onSuccess,
}: TemplateEditDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [tagIds, setTagIds] = useState<string[]>(initialTagIds);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setDescription(initialDescription);
      setIsPublic(initialIsPublic);
      setTagIds(initialTagIds);
      setError(null);
    }
  }, [open, initialName, initialDescription, initialIsPublic, initialTagIds]);

  const tags = trpc.template.listTags.useQuery(undefined, { enabled: open });
  const utils = trpc.useUtils();
  const updateMutation = trpc.template.update.useMutation({
    onSuccess: () => {
      utils.template.list.invalidate();
      utils.template.get.invalidate({ templateId: templateId ?? "" });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message || "更新失败，请稍后重试。");
    },
  });

  const toggleTag = (id: string) => {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!templateId) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("名称不能为空");
      return;
    }
    setError(null);
    updateMutation.mutate({
      templateId,
      name: trimmedName,
      description: description.trim() || undefined,
      isPublic,
      tagIds,
    });
  };

  if (!templateId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>编辑模板</DialogTitle>
          <DialogDescription>修改模板名称、描述、可见性和标签。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">名称</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="模板名称"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-desc">描述</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简短描述（可选）"
            />
          </div>
          <div className="grid gap-2">
            <Label>可见性</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isPublic ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPublic(true)}
              >
                公开
              </Button>
              <Button
                type="button"
                variant={!isPublic ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPublic(false)}
              >
                私有
              </Button>
            </div>
          </div>
          {tags.data && tags.data.length > 0 ? (
            <div className="grid gap-2">
              <Label>标签</Label>
              <div className="flex flex-wrap gap-1.5">
                {tags.data.map((tag) => (
                  <Button
                    key={tag.id}
                    type="button"
                    variant={tagIds.includes(tag.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
