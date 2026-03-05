"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@daemon/hooks";
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
} from "@daemon/ui";
import { detectPresetFromConfig } from "@daemon/domain";
import { CUSTOM_PROVIDER_ID } from "@daemon/domain";
import {
  LlmProviderSection,
  EMPTY_LLM_PROVIDER_STATE,
} from "@/src/components/llm-provider-section";
import type { LlmProviderFormState } from "@/src/components/llm-provider-section";
import { findProviderPreset } from "@daemon/domain";

export interface TemplateForClone {
  id: string;
  name: string;
  description?: string | null;
  config: Record<string, unknown>;
}

function templateConfigToFormState(config: Record<string, unknown>): LlmProviderFormState {
  const lp = config?.llmProvider as Record<string, unknown> | undefined;
  if (!lp || typeof lp !== "object") return EMPTY_LLM_PROVIDER_STATE;

  const detected = detectPresetFromConfig({
    baseURL: typeof lp.baseURL === "string" ? lp.baseURL : undefined,
    model: typeof lp.model === "string" ? lp.model : undefined,
  });

  const presetId =
    (lp.presetId as string) ??
    detected?.providerId ??
    (lp.baseURL ? CUSTOM_PROVIDER_ID : "");

  return {
    presetId: presetId || "",
    model: (lp.model as string) ?? "",
    baseURL: (lp.baseURL as string) ?? "",
    apiKey: "",
    sdkProvider: (lp.sdkProvider as LlmProviderFormState["sdkProvider"]) ?? "openai",
  };
}

function formStateToLlmProviderConfig(lp: LlmProviderFormState): {
  model: string;
  baseURL: string;
  apiKey: string;
  presetId?: string;
  sdkProvider: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
} | null {
  if (!lp.presetId) return null;
  const baseURL =
    lp.presetId === CUSTOM_PROVIDER_ID
      ? lp.baseURL
      : findProviderPreset(lp.presetId)?.baseURL ?? lp.baseURL;
  if (!baseURL?.trim() || !lp.model.trim()) return null;
  return {
    baseURL: baseURL.trim(),
    model: lp.model.trim(),
    apiKey: lp.apiKey,
    presetId: lp.presetId === CUSTOM_PROVIDER_ID ? undefined : lp.presetId,
    sdkProvider: lp.sdkProvider,
  };
}

interface CloneConfigDialogProps {
  template: TemplateForClone | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloneConfigDialog({ template, open, onOpenChange }: CloneConfigDialogProps) {
  const router = useRouter();
  const [agentName, setAgentName] = useState("");
  const [llmProvider, setLlmProvider] = useState<LlmProviderFormState>(EMPTY_LLM_PROVIDER_STATE);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open && template) {
      setAgentName(`${template.name} (copy)`);
      setLlmProvider(templateConfigToFormState(template.config));
      setFormError(null);
    }
  }, [open, template]);

  const resetForm = () => {
    if (template) {
      setAgentName(`${template.name} (copy)`);
      setLlmProvider(templateConfigToFormState(template.config));
    } else {
      setAgentName("");
      setLlmProvider(EMPTY_LLM_PROVIDER_STATE);
    }
    setFormError(null);
  };

  const cloneTemplate = trpc.template.clone.useMutation({
    onSuccess: (data) => {
      onOpenChange(false);
      resetForm();
      router.push(`/chat/${data.agentId}`);
    },
    onError: (err) => {
      setFormError(err.message || "克隆失败，请稍后重试。");
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (!template) return;
    setFormError(null);

    const trimmedName = (agentName || `${template.name} (copy)`).trim() || `${template.name} (copy)`;

    const llmConfig = formStateToLlmProviderConfig(llmProvider);
    if (llmProvider.presetId) {
      if (llmProvider.presetId === CUSTOM_PROVIDER_ID) {
        if (!llmProvider.baseURL.trim() || !llmProvider.model.trim()) {
          setFormError("自定义 Provider 需填写 Base URL 和模型名。");
          return;
        }
      }
      if (!llmProvider.apiKey.trim()) {
        setFormError("请填写 API Key。");
        return;
      }
      if (!llmConfig) {
        setFormError("请完善 LLM 配置（Base URL 和模型）。");
        return;
      }
    }

    cloneTemplate.mutate({
      templateId: template.id,
      agentName: trimmedName,
      llmProviderOverrides: llmConfig ?? undefined,
    });
  };

  if (!template) return null;

  const isOpen = open && Boolean(template);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>克隆并配置</DialogTitle>
          <DialogDescription>
            配置 LLM Provider 与 API Key，克隆完成后即可直接使用。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-1.5">
            <Label htmlFor="clone-agent-name">Agent 名称</Label>
            <Input
              id="clone-agent-name"
              value={agentName || `${template.name} (copy)`}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder={`${template.name} (copy)`}
            />
          </div>

          <LlmProviderSection value={llmProvider} onChange={setLlmProvider} />

          {formError ? (
            <p className="text-sm text-destructive">{formError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={cloneTemplate.isPending}
          >
            {cloneTemplate.isPending ? "克隆中..." : "确认克隆"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
