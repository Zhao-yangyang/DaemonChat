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
  Input,
  Label,
} from "@daemon/ui";

type WorkspaceCreateDialogProps = {
  open: boolean;
  name: string;
  slug: string;
  isPending: boolean;
  error: string | null;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function WorkspaceCreateDialog({
  open,
  name,
  slug,
  isPending,
  error,
  onNameChange,
  onSlugChange,
  onClose,
  onSubmit,
}: WorkspaceCreateDialogProps) {
  const t = useTranslations("workspaces");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="workspace-create-dialog">
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ws-name">{t("nameLabel")}</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={t("namePlaceholder")}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ws-slug">{t("slugLabel")}</Label>
            <Input
              id="ws-slug"
              value={slug}
              onChange={(e) =>
                onSlugChange(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-")
                    .replace(/-{2,}/g, "-"),
                )
              }
              placeholder="product-team"
            />
            <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            data-testid="workspace-create-submit"
            onClick={onSubmit}
            disabled={!name.trim() || !slug.trim() || isPending}
          >
            {isPending ? t("creating") : t("createBtn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
