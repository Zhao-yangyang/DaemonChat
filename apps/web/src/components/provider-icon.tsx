"use client";

import {
  OpenAI,
  Anthropic,
  Google,
  DeepSeek,
  Grok,
  Mistral,
  Moonshot,
  OpenRouter,
} from "@lobehub/icons";
import { Bot } from "lucide-react";

const PROVIDER_ICONS: Record<string, React.FC<{ size?: number }>> = {
  openai: OpenAI,
  anthropic: Anthropic,
  google: Google,
  deepseek: DeepSeek,
  xai: Grok,
  mistral: Mistral,
  moonshot: Moonshot,
  openrouter: OpenRouter,
};

export function ProviderIcon({
  providerId,
  size = 18,
}: {
  providerId: string;
  size?: number;
}) {
  const Icon = PROVIDER_ICONS[providerId];
  if (!Icon) return <Bot size={size} />;
  return <Icon size={size} />;
}
