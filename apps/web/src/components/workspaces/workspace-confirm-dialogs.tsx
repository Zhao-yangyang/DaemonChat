"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@daemon/ui";

// ——— Delete Workspace ———

type WorkspaceDeleteDialogProps = {
  workspaceName: string;
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function WorkspaceDeleteDialog({
  workspaceName,
  open,
  isPending,
  onClose,
  onConfirm,
}: WorkspaceDeleteDialogProps) {
  const t = useTranslations("workspaces");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" data-testid="workspace-delete-dialog">
        <DialogHeader>
          <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
          <DialogDescription>{t("deleteDialogDesc", { name: workspaceName })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            data-testid="workspace-delete-confirm"
            onClick={onConfirm}
          >
            {isPending ? t("deleting") : t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ——— Remove Member ———

type WorkspaceRemoveDialogProps = {
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function WorkspaceRemoveDialog({
  open,
  isPending,
  onClose,
  onConfirm,
}: WorkspaceRemoveDialogProps) {
  const t = useTranslations("workspaces");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" data-testid="workspace-remove-dialog">
        <DialogHeader>
          <DialogTitle>{t("removeDialogTitle")}</DialogTitle>
          <DialogDescription>{t("removeDialogDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            data-testid="workspace-remove-confirm"
            onClick={onConfirm}
          >
            {isPending ? t("removing") : t("remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
