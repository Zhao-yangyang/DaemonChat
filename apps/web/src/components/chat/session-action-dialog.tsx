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

export type SessionActionType = "archive" | "unarchive" | "delete";

export type SessionActionDialogState = {
  type: SessionActionType;
  sessionKey: string;
  sessionId: string;
};

type SessionActionDialogProps = {
  dialog: SessionActionDialogState | null;
  sessionLabel: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function SessionActionDialog({
  dialog,
  sessionLabel,
  isPending,
  onClose,
  onConfirm,
}: SessionActionDialogProps) {
  const t = useTranslations("chat");

  const title =
    dialog?.type === "archive"
      ? t("archive")
      : dialog?.type === "unarchive"
        ? t("unarchive")
        : t("deleteSession");

  const description =
    dialog?.type === "archive"
      ? t("confirmArchive", { name: sessionLabel })
      : dialog?.type === "unarchive"
        ? t("confirmUnarchive", { name: sessionLabel })
        : t("confirmDeleteSession", { name: sessionLabel });

  return (
    <Dialog
      open={Boolean(dialog)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" data-testid="session-action-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            variant={dialog?.type === "delete" ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
            data-testid="session-action-confirm"
          >
            {title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
