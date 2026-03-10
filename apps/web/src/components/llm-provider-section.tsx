"use client";

import { useEffect, useState } from "react";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@daemon/ui";
import {
  LLM_PROVIDER_PRESETS,
  CUSTOM_PROVIDER_ID,
  findProviderPreset,
  getDefaultModelForPreset,
} from "@daemon/domain";
import type { LlmProviderPreset } from "@daemon/domain";
import { ProviderIcon } from "@/src/components/provider-icon";
import { ModelCombobox } from "@/src/components/model-combobox";

export interface LlmProviderFormState {
  presetId: string;
  model: string;
  baseURL: string;
  apiKey: string;
  sdkProvider: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
}

export const EMPTY_LLM_PROVIDER_STATE: LlmProviderFormState = {
  presetId: "",
  model: "",
  baseURL: "",
  apiKey: "",
  sdkProvider: "openai",
};

interface LlmProviderSectionProps {
  value: LlmProviderFormState;
  onChange: (value: LlmProviderFormState) => void;
  /** 覆盖 API Key 输入框的 placeholder，用于「已配置」等提示 */
  apiKeyPlaceholder?: string;
}

export function LlmProviderSection({
  value,
  onChange,
  apiKeyPlaceholder,
}: LlmProviderSectionProps) {
  const [dynamicProviders, setDynamicProviders] =
    useState<LlmProviderPreset[]>(LLM_PROVIDER_PRESETS);
  const [dynamicModels, setDynamicModels] = useState<Array<{ id: string; name: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  // Fetch providers list once
  useEffect(() => {
    fetch("/api/providers")
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.providers)) {
          setDynamicProviders(data.providers);
        }
      })
      .catch((err) => console.error("Failed to fetch dynamic providers", err));
  }, []);

  // Fetch models when provider or API key changes
  useEffect(() => {
    const { presetId, apiKey, baseURL, sdkProvider } = value;

    if (!presetId || presetId === CUSTOM_PROVIDER_ID) {
      setDynamicModels([]);
      return;
    }

    const preset = dynamicProviders.find((p) => p.id === presetId);
    if (!preset) return;

    // Immediately show static fallback models from preset
    const fallbackStaticModels = preset.models.map((m) => ({ id: m.id, name: m.label }));
    setDynamicModels(fallbackStaticModels);

    // Fetch dynamic models from API
    setModelsLoading(true);
    fetch("/api/providers/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdkProvider, apiKey, baseURL, providerId: presetId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.models && data.models.length > 0) {
          setDynamicModels(data.models);

          // Auto-select first model if current selection is invalid
          const currentSelected = value.model;
          const exists = data.models.some((m: { id: string }) => m.id === currentSelected);
          if (!currentSelected || !exists) {
            onChange({ ...value, model: data.models[0].id });
          }
        }
      })
      .catch(() => {
        // Keep static fallback models on error
      })
      .finally(() => setModelsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch models only when provider config fields change, not on every value/onChange ref change
  }, [value.presetId, value.apiKey, value.baseURL, value.sdkProvider]);

  const handleProviderChange = (val: string) => {
    if (val === CUSTOM_PROVIDER_ID) {
      onChange({
        ...value,
        presetId: CUSTOM_PROVIDER_ID,
        baseURL: "",
        model: "",
        sdkProvider: "openai",
      });
    } else {
      const preset = dynamicProviders.find((p) => p.id === val);
      if (!preset) return;
      onChange({
        ...value,
        presetId: val,
        baseURL: preset.baseURL,
        model: getDefaultModelForPreset(preset),
        sdkProvider: preset.sdkProvider ?? "openai",
      });
    }
  };

  const selectedPreset =
    value.presetId && value.presetId !== CUSTOM_PROVIDER_ID
      ? dynamicProviders.find((p) => p.id === value.presetId)
      : null;

  const apiKeyHelpUrl = findProviderPreset(value.presetId)?.apiKeyHelpUrl;
  const resolvedApiKeyPlaceholder =
    apiKeyPlaceholder ?? findProviderPreset(value.presetId)?.apiKeyPlaceholder ?? "sk-...";

  return (
    <div className="grid gap-1.5 rounded-md border p-4 bg-muted/20">
      <Label className="text-base font-semibold">LLM Provider</Label>
      <p className="text-xs text-muted-foreground mb-2">
        选择大模型提供商，填入 API Key 即可使用。
      </p>
      <div className="grid gap-3">
        {/* Provider selector */}
        <div className="grid gap-1.5">
          <Label className="text-xs">提供商</Label>
          <Select value={value.presetId} onValueChange={handleProviderChange}>
            <SelectTrigger>
              <SelectValue placeholder="选择提供商..." />
            </SelectTrigger>
            <SelectContent>
              {dynamicProviders.map((p) => (
                <SelectItem key={p.id} value={p.id} className="flex items-center gap-2">
                  <ProviderIcon providerId={p.id} size={18} className="shrink-0" />
                  <span className="truncate">{p.label}</span>
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_PROVIDER_ID} className="flex items-center gap-2">
                <ProviderIcon providerId={CUSTOM_PROVIDER_ID} size={18} className="shrink-0" />
                <span>自定义 (Advanced)</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Model selector for preset providers */}
        {selectedPreset && (
          <div className="grid gap-1.5">
            <Label className="text-xs">模型</Label>
            <ModelCombobox
              value={value.model}
              onChange={(val: string) => onChange({ ...value, model: val })}
              models={dynamicModels}
              loading={modelsLoading}
              placeholder="选择或输入模型"
            />
          </div>
        )}

        {/* Custom provider fields */}
        {value.presetId === CUSTOM_PROVIDER_ID && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="llm-baseurl" className="text-xs">
                Base URL
              </Label>
              <Input
                id="llm-baseurl"
                value={value.baseURL}
                onChange={(e) => onChange({ ...value, baseURL: e.target.value })}
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="llm-model" className="text-xs">
                Model Name
              </Label>
              <Input
                id="llm-model"
                value={value.model}
                onChange={(e) => onChange({ ...value, model: e.target.value })}
                placeholder="model-name"
              />
            </div>
          </>
        )}

        {/* API Key (shown when any provider is selected) */}
        {value.presetId && (
          <div className="grid gap-1.5">
            <Label htmlFor="llm-apikey" className="text-xs">
              API Key
            </Label>
            <Input
              id="llm-apikey"
              type="password"
              value={value.apiKey}
              onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              placeholder={resolvedApiKeyPlaceholder}
            />
            {apiKeyHelpUrl && (
              <a
                href={apiKeyHelpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                获取 API Key
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
