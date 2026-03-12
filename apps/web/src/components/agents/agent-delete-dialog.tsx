"use client";

import { useTranslations } from "next-intl";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@daemon/ui";

type AgentDeleteDialogProps = {
  open: boolean;
  agentName: string | null;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function AgentDeleteDialog({
  open,
  agentName,
  isPending,
  error,
  onClose,
  onConfirm,
}: AgentDeleteDialogProps) {
  const t = useTranslations("agents");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="agent-delete-dialog">
        <DialogHeader>
          <DialogTitle>{t("deleteDialogTitle")}</DialogTitle>
          <DialogDescription>
            {agentName
              ? t("deleteDialogConfirm", { name: agentName })
              : t("deleteDialogConfirmDefault")}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={isPending}
            data-testid="agent-delete-confirm"
            onClick={onConfirm}
          >
            {isPending ? t("deleting") : t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
