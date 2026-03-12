"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@daemon/ui";

const MEMORY_TYPES = ["fact", "rule", "preference", "task"] as const;
const SENSITIVITY_OPTIONS = ["public", "private", "secret"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type Sensitivity = (typeof SENSITIVITY_OPTIONS)[number];

type MemoryCreateFormProps = {
  agentId: string;
  userId: string;
  content: string;
  type: MemoryType;
  tags: string;
  sensitivity: Sensitivity;
  contextEligible: boolean;
  isPending: boolean;
  getTypeLabel: (type: MemoryType) => string;
  getSensitivityLabel: (s: Sensitivity) => string;
  onContentChange: (v: string) => void;
  onTypeChange: (v: MemoryType) => void;
  onTagsChange: (v: string) => void;
  onSensitivityChange: (v: Sensitivity) => void;
  onContextEligibleChange: (v: boolean) => void;
  onSubmit: () => void;
};

export function MemoryCreateForm({
  agentId,
  userId,
  content,
  type,
  tags,
  sensitivity,
  contextEligible,
  isPending,
  getTypeLabel,
  getSensitivityLabel,
  onContentChange,
  onTypeChange,
  onTagsChange,
  onSensitivityChange,
  onContextEligibleChange,
  onSubmit,
}: MemoryCreateFormProps) {
  const t = useTranslations("memory");

  return (
    <Card data-testid="memory-create-form">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{t("createTitle")}</CardTitle>
        <CardDescription>{t("createDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder={t("createContentPlaceholder")}
          className="min-h-16"
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label>{t("typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as MemoryType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMORY_TYPES.map((mt) => (
                  <SelectItem key={mt} value={mt}>
                    {getTypeLabel(mt)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("sensitivityLabel")}</Label>
            <Select value={sensitivity} onValueChange={(v) => onSensitivityChange(v as Sensitivity)}>
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
          <div className="space-y-1.5">
            <Label>{t("tagsLabel")}</Label>
            <Input
              value={tags}
              onChange={(e) => onTagsChange(e.target.value)}
              placeholder={t("tagsPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("contextEligibleLabel")}</Label>
            <Select
              value={contextEligible ? "yes" : "no"}
              onValueChange={(v) => onContextEligibleChange(v === "yes")}
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
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={!agentId || !content.trim() || !userId || isPending}
            data-testid="memory-create-submit"
          >
            {isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
