"use client";

import { trpc } from "@daemon/hooks";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@daemon/ui";

interface TemplateDeleteDialogProps {
  templateId: string | null;
  templateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TemplateDeleteDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
  onSuccess,
}: TemplateDeleteDialogProps) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.template.delete.useMutation({
    onSuccess: () => {
      utils.template.list.invalidate();
      onOpenChange(false);
      onSuccess?.();
    },
  });

  const handleConfirm = () => {
    if (!templateId) return;
    deleteMutation.mutate({ templateId });
  };

  if (!templateId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>确认删除</DialogTitle>
          <DialogDescription>
            确定要删除模板「{templateName}」吗？此操作不可恢复。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "删除中..." : "删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
