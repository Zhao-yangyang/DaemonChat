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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@daemon/ui";

type InviteRole = "admin" | "member" | "viewer";

type WorkspaceInviteDialogProps = {
  open: boolean;
  userId: string;
  role: InviteRole;
  isPending: boolean;
  onUserIdChange: (value: string) => void;
  onRoleChange: (value: InviteRole) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function WorkspaceInviteDialog({
  open,
  userId,
  role,
  isPending,
  onUserIdChange,
  onRoleChange,
  onClose,
  onSubmit,
}: WorkspaceInviteDialogProps) {
  const t = useTranslations("workspaces");

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="workspace-invite-dialog">
        <DialogHeader>
          <DialogTitle>{t("inviteDialogTitle")}</DialogTitle>
          <DialogDescription>{t("inviteDialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-user-id">{t("userIdLabel")}</Label>
            <Input
              id="invite-user-id"
              value={userId}
              onChange={(e) => onUserIdChange(e.target.value.trim())}
              placeholder={t("userIdPlaceholder")}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">{t("roleLabel")}</Label>
            <Select value={role} onValueChange={(v) => onRoleChange(v as InviteRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t("roleAdmin")}</SelectItem>
                <SelectItem value="member">{t("roleMember")}</SelectItem>
                <SelectItem value="viewer">{t("roleViewer")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button
            data-testid="workspace-invite-submit"
            onClick={onSubmit}
            disabled={!userId.trim() || isPending}
          >
            {isPending ? t("inviting") : t("invite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
