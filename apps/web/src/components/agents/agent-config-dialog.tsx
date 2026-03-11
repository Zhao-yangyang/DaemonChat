"use client";

import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@daemon/ui";
import { API_KEY_REDACTED } from "@daemon/domain";
import {
  LlmProviderSection,
  type LlmProviderFormState,
} from "@/src/components/llm-provider-section";

type AgentVisibility = "private" | "workspace" | "public";

export type AgentConfigForm = {
  systemPrompt: string;
  memoryTopK: string;
  recentMessages: string;
  temperature: string;
  visibility: AgentVisibility;
  llmProvider: LlmProviderFormState;
  apiKeyConfigured: boolean;
};

export type AgentConfigDialogProps = {
  open: boolean;
  agentId: string | null;
  agentName: string | undefined;
  form: AgentConfigForm;
  formError: string | null;
  isPending: boolean;
  onFormChange: (form: AgentConfigForm) => void;
  onSave: () => void;
  onClose: () => void;
};

export function AgentConfigDialog({
  open,
  agentId,
  agentName,
  form,
  formError,
  isPending,
  onFormChange,
  onSave,
  onClose,
}: AgentConfigDialogProps) {
  const t = useTranslations("agents");
  const locale = useLocale();

  const set = <K extends keyof AgentConfigForm>(key: K, value: AgentConfigForm[K]) =>
    onFormChange({ ...form, [key]: value });

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("configDialogTitle")}</DialogTitle>
          <DialogDescription>
            {agentName
              ? t("configDialogDescEditing", { name: agentName })
              : t("configDialogDescDefault")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* System Prompt */}
          <div className="grid gap-1.5">
            <Label htmlFor="cfg-system-prompt">{t("systemPromptLabel")}</Label>
            <Textarea
              id="cfg-system-prompt"
              rows={4}
              value={form.systemPrompt}
              onChange={(e) => set("systemPrompt", e.target.value)}
              placeholder={t("systemPromptPlaceholder")}
            />
          </div>

          {/* LLM Provider */}
          <LlmProviderSection
            value={form.llmProvider}
            onChange={(lp) => set("llmProvider", lp)}
            apiKeyPlaceholder={form.apiKeyConfigured ? t("apiKeyPlaceholder") : undefined}
          />

          {/* Visibility */}
          <div className="grid gap-1.5">
            <Label>{t("visibilityLabel")}</Label>
            <div className="flex gap-2">
              <Select
                value={form.visibility}
                onValueChange={(v) => set("visibility", v as AgentVisibility)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">{t("visibilityPrivate")}</SelectItem>
                  <SelectItem value="workspace">{t("visibilityWorkspace")}</SelectItem>
                  <SelectItem value="public">{t("visibilityPublic")}</SelectItem>
                </SelectContent>
              </Select>
              {form.visibility === "public" && agentId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const origin =
                      typeof window !== "undefined" ? window.location.origin : "";
                    const url = `${origin}/${locale}/share/${agentId}`;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success(t("shareLinkCopied"));
                    } catch {
                      toast.error(t("copyFailed"));
                    }
                  }}
                >
                  {t("copyShareLink")}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Context params */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-memory-topk">{t("memoryTopKLabel")}</Label>
              <Input
                id="cfg-memory-topk"
                type="number"
                min={1}
                max={50}
                value={form.memoryTopK}
                onChange={(e) => set("memoryTopK", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-recent-messages">{t("recentMessagesLabel")}</Label>
              <Input
                id="cfg-recent-messages"
                type="number"
                min={1}
                max={100}
                value={form.recentMessages}
                onChange={(e) => set("recentMessages", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cfg-temperature">{t("temperatureLabel")}</Label>
              <Input
                id="cfg-temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => set("temperature", e.target.value)}
              />
            </div>
          </div>

          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={onSave} disabled={isPending || !agentId}>
            {isPending ? t("saving") : t("saveConfig")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export for convenience
export { API_KEY_REDACTED };
