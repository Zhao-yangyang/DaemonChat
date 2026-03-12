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
  Label,
  Textarea,
} from "@daemon/ui";

type AgentPublishDialogProps = {
  open: boolean;
  isUpdate: boolean;
  description: string;
  isPublic: boolean;
  isPending: boolean;
  isSuccess: boolean;
  error: string | null;
  onDescriptionChange: (value: string) => void;
  onIsPublicChange: (value: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function AgentPublishDialog({
  open,
  isUpdate,
  description,
  isPublic,
  isPending,
  isSuccess,
  error,
  onDescriptionChange,
  onIsPublicChange,
  onClose,
  onSubmit,
}: AgentPublishDialogProps) {
  const t = useTranslations("agents");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="agent-publish-dialog">
        <DialogHeader>
          <DialogTitle>
            {isUpdate ? t("updateTemplateDialogTitle") : t("publishDialogTitle")}
          </DialogTitle>
          <DialogDescription>
            {isUpdate ? t("updateTemplateDialogDesc") : t("publishDialogDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="publish-desc">{t("publishDescLabel")}</Label>
            <Textarea
              id="publish-desc"
              rows={3}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder={t("publishDescPlaceholder")}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => onIsPublicChange(e.target.checked)}
              className="rounded"
            />
            {t("publishPublic")}
          </label>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {isSuccess ? (
            <Alert>
              <AlertDescription>{t("publishSuccess")}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            data-testid="agent-publish-confirm"
            onClick={onSubmit}
            disabled={isPending || isSuccess}
          >
            {isPending
              ? t("publishSubmitting")
              : isUpdate
                ? t("confirmUpdate")
                : t("confirmPublish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
