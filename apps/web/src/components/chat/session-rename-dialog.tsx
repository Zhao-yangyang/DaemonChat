"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@daemon/ui";

export type SessionRenameDialogState = {
  sessionKey: string;
  currentName: string;
};

type SessionRenameDialogProps = {
  dialog: SessionRenameDialogState | null;
  value: string;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onChange: (value: string) => void;
};

export function SessionRenameDialog({
  dialog,
  value,
  isPending,
  onClose,
  onConfirm,
  onChange,
}: SessionRenameDialogProps) {
  const t = useTranslations("chat");

  return (
    <Dialog
      open={Boolean(dialog)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" data-testid="session-rename-dialog">
        <DialogHeader>
          <DialogTitle>{t("renameSession")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label htmlFor="rename-session-input">{t("sessionNameLabel")}</Label>
          <Input
            id="rename-session-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={!value.trim() || isPending}
            data-testid="session-rename-confirm"
          >
            {isPending ? t("renaming") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
