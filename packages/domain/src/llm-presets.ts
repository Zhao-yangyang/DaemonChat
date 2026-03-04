// ---------------------------------------------------------------------------
// LLM Provider / Model Preset Registry
// ---------------------------------------------------------------------------

export interface LlmModelPreset {
  id: string;
  label: string;
  isDefault?: boolean;
}

export interface LlmProviderPreset {
  id: string;
  label: string;
  baseURL: string;
  models: LlmModelPreset[];
  apiKeyPlaceholder?: string;
  apiKeyHelpUrl?: string;
  sdkProvider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o", label: "GPT-4o", isDefault: true },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { id: "o3", label: "o3" },
      { id: "o3-mini", label: "o3 Mini" },
      { id: "o4-mini", label: "o4 Mini" },
    ],
    apiKeyPlaceholder: "sk-...",
    apiKeyHelpUrl: "https://platform.openai.com/api-keys",
    sdkProvider: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseURL: "https://api.anthropic.com",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", isDefault: true },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    ],
    apiKeyPlaceholder: "sk-ant-...",
    apiKeyHelpUrl: "https://console.anthropic.com/settings/keys",
    sdkProvider: "anthropic",
  },
  {
    id: "google",
    label: "Google AI Studio",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      { id: "gemini-2.5-flash-preview-04-17", label: "Gemini 2.5 Flash", isDefault: true },
      { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
    apiKeyPlaceholder: "AIza...",
    apiKeyHelpUrl: "https://aistudio.google.com/apikey",
    sdkProvider: "google",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat (V3)", isDefault: true },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner (R1)" },
    ],
    apiKeyPlaceholder: "sk-...",
    apiKeyHelpUrl: "https://platform.deepseek.com/api_keys",
    sdkProvider: "deepseek",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseURL: "https://api.x.ai",
    models: [
      { id: "grok-3", label: "Grok 3", isDefault: true },
      { id: "grok-3-mini", label: "Grok 3 Mini" },
    ],
    apiKeyPlaceholder: "xai-...",
    apiKeyHelpUrl: "https://console.x.ai",
    sdkProvider: "xai",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    baseURL: "https://api.mistral.ai",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large", isDefault: true },
      { id: "mistral-small-latest", label: "Mistral Small" },
      { id: "codestral-latest", label: "Codestral" },
    ],
    apiKeyPlaceholder: "...",
    apiKeyHelpUrl: "https://console.mistral.ai/api-keys",
    sdkProvider: "mistral",
  },
  {
    id: "moonshot",
    label: "Moonshot AI (Kimi)",
    baseURL: "https://api.moonshot.cn/v1",
    models: [
      { id: "moonshot-v1-auto", label: "Moonshot v1 Auto", isDefault: true },
      { id: "moonshot-v1-8k", label: "Moonshot v1 8K" },
      { id: "moonshot-v1-32k", label: "Moonshot v1 32K" },
      { id: "moonshot-v1-128k", label: "Moonshot v1 128K" },
    ],
    apiKeyPlaceholder: "sk-...",
    sdkProvider: "openai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    models: [
      { id: "openai/gpt-4o", label: "GPT-4o (via OpenRouter)", isDefault: true },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4 (via OpenRouter)" },
      { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash (via OpenRouter)" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat (via OpenRouter)" },
    ],
    apiKeyPlaceholder: "sk-or-...",
    apiKeyHelpUrl: "https://openrouter.ai/keys",
    sdkProvider: "openai",
  },
];

export const CUSTOM_PROVIDER_ID = "__custom__";

export function findProviderPreset(providerId: string): LlmProviderPreset | undefined {
  return LLM_PROVIDER_PRESETS.find((p) => p.id === providerId);
}

export function findModelInPreset(
  preset: LlmProviderPreset,
  modelId: string,
): LlmModelPreset | undefined {
  return preset.models.find((m) => m.id === modelId);
}

export function getDefaultModelForPreset(preset: LlmProviderPreset): string {
  return preset.models.find((m) => m.isDefault)?.id ?? preset.models[0]?.id ?? "";
}

/**
 * Detect which preset (if any) matches an existing LlmProviderConfig.
 * Used when opening the edit dialog to restore the preset selection state.
 */
export function detectPresetFromConfig(config: {
  baseURL?: string;
  model?: string;
}): { providerId: string; modelId: string } | null {
  if (!config.baseURL) return null;
  const normalizedBase = config.baseURL.replace(/\/+$/, "");
  for (const preset of LLM_PROVIDER_PRESETS) {
    const presetBase = preset.baseURL.replace(/\/+$/, "");
    if (normalizedBase === presetBase) {
      const modelId = config.model ?? getDefaultModelForPreset(preset);
      return { providerId: preset.id, modelId };
    }
  }
  return null;
}
