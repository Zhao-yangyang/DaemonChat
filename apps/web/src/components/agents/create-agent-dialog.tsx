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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@daemon/ui";
import {
  LlmProviderSection,
  type LlmProviderFormState,
} from "@/src/components/llm-provider-section";

type AgentVisibility = "private" | "workspace" | "public";

export type CreateAgentForm = {
  name: string;
  workspaceId?: string;
  systemPrompt: string;
  memoryTopK: string;
  recentMessages: string;
  temperature: string;
  visibility: AgentVisibility;
  llmProvider: LlmProviderFormState;
  apiKeyConfigured: boolean;
};

export type WorkspaceOption = {
  id: string;
  name: string;
};

export type CreateAgentDialogProps = {
  open: boolean;
  form: CreateAgentForm;
  formError: string | null;
  mutationError: string | null;
  isPending: boolean;
  workspaces: WorkspaceOption[];
  onFormChange: (form: CreateAgentForm) => void;
  onCreate: () => void;
  onClose: () => void;
};

export function CreateAgentDialog({
  open,
  form,
  formError,
  mutationError,
  isPending,
  workspaces,
  onFormChange,
  onCreate,
  onClose,
}: CreateAgentDialogProps) {
  const t = useTranslations("agents");

  const set = <K extends keyof CreateAgentForm>(key: K, value: CreateAgentForm[K]) =>
    onFormChange({ ...form, [key]: value });

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("createDialogTitle")}</DialogTitle>
          <DialogDescription>{t("createDialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Agent name */}
          <div className="grid gap-1.5">
            <Label htmlFor="create-agent-name">{t("agentNameLabel")}</Label>
            <Input
              id="create-agent-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={t("agentNamePlaceholder")}
              autoFocus
            />
          </div>

          {/* Workspace selector — only shown when user has workspaces */}
          {workspaces.length > 0 ? (
            <div className="grid gap-1.5">
              <Label htmlFor="create-agent-workspace">{t("workspaceLabel")}</Label>
              <Select
                value={form.workspaceId ?? ""}
                onValueChange={(v) => set("workspaceId", v || undefined)}
              >
                <SelectTrigger id="create-agent-workspace">
                  <SelectValue placeholder={t("workspacePersonalPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("workspacePersonal")}</SelectItem>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* System Prompt */}
          <div className="grid gap-1.5">
            <Label htmlFor="create-agent-system-prompt">{t("systemPromptLabel")}</Label>
            <Textarea
              id="create-agent-system-prompt"
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
          />

          {/* Context params */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="create-agent-memory-topk">{t("memoryTopKLabel")}</Label>
              <Input
                id="create-agent-memory-topk"
                type="number"
                min={1}
                max={50}
                value={form.memoryTopK}
                onChange={(e) => set("memoryTopK", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-agent-recent-messages">{t("recentMessagesLabel")}</Label>
              <Input
                id="create-agent-recent-messages"
                type="number"
                min={1}
                max={100}
                value={form.recentMessages}
                onChange={(e) => set("recentMessages", e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="create-agent-temperature">{t("temperatureLabel")}</Label>
              <Input
                id="create-agent-temperature"
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
          {mutationError ? (
            <Alert variant="destructive">
              <AlertDescription>{mutationError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("cancel")}
          </Button>
          <Button onClick={onCreate} disabled={isPending}>
            {isPending ? t("creating") : t("createAndChat")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
