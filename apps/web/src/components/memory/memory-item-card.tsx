"use client";

import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@daemon/ui";

const SENSITIVITY_OPTIONS = ["public", "private", "secret"] as const;

type MemoryType = "fact" | "rule" | "preference" | "task";
type Sensitivity = (typeof SENSITIVITY_OPTIONS)[number];

const TYPE_COLORS: Record<MemoryType, string> = {
  fact: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  rule: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  preference: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  task: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export type MemoryItem = {
  id: string;
  content: string;
  type: string;
  sensitivity: string;
  contextEligible: boolean;
  tags: string[];
  createdAt: string;
};

export type MemoryItemEditState = {
  content: string;
  tags: string;
  sensitivity: Sensitivity;
  contextEligible: boolean;
};

type MemoryItemCardProps = {
  item: MemoryItem;
  locale: string;
  isEditing: boolean;
  editState: MemoryItemEditState;
  isSavePending: boolean;
  isDeletePending: boolean;
  getTypeLabel: (type: MemoryType) => string;
  getSensitivityLabel: (s: Sensitivity) => string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditChange: (patch: Partial<MemoryItemEditState>) => void;
  onEditSave: () => void;
  onDeleteRequest: () => void;
};

export function MemoryItemCard({
  item,
  locale,
  isEditing,
  editState,
  isSavePending,
  isDeletePending,
  getTypeLabel,
  getSensitivityLabel,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSave,
  onDeleteRequest,
}: MemoryItemCardProps) {
  const t = useTranslations("memory");

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="py-3">
        {isEditing ? (
          <div className="space-y-3">
            <Textarea
              value={editState.content}
              onChange={(e) => onEditChange({ content: e.target.value })}
              className="min-h-16"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("editTagsLabel")}</Label>
                <Input
                  value={editState.tags}
                  onChange={(e) => onEditChange({ tags: e.target.value })}
                  placeholder={t("editTagsPlaceholder")}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("sensitivityLabel")}</Label>
                <Select
                  value={editState.sensitivity}
                  onValueChange={(v) => onEditChange({ sensitivity: v as Sensitivity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENSITIVITY_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {getSensitivityLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("contextEligibleLabel")}</Label>
                <Select
                  value={editState.contextEligible ? "yes" : "no"}
                  onValueChange={(v) => onEditChange({ contextEligible: v === "yes" })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">{t("contextEligibleYes")}</SelectItem>
                    <SelectItem value="no">{t("contextEligibleNo")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="xs" variant="ghost" onClick={onEditCancel}>
                {t("cancel")}
              </Button>
              <Button
                size="xs"
                disabled={isSavePending || !editState.content.trim()}
                onClick={onEditSave}
              >
                {isSavePending ? t("saving") : t("save")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{item.content}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${TYPE_COLORS[item.type as MemoryType] ?? ""}`}
              >
                {getTypeLabel(item.type as MemoryType) ?? item.type}
              </span>
              <Badge variant="secondary" className="text-xs">
                {getSensitivityLabel(item.sensitivity as Sensitivity)}
              </Badge>
              {!item.contextEligible && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {t("notInjected")}
                </Badge>
              )}
              {item.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button size="xs" variant="ghost" onClick={onEditStart}>
                {t("edit")}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="text-destructive"
                disabled={isDeletePending}
                onClick={onDeleteRequest}
                data-testid="memory-delete-item-btn"
              >
                {t("delete")}
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString(locale)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
