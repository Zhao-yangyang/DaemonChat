import { NextResponse } from "next/server";
import { LLM_PROVIDER_PRESETS } from "@daemon/domain";
import type { LlmProviderPreset } from "@daemon/domain";

// Simple in-memory cache (5 min TTL)
let cachedProviders: LlmProviderPreset[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (cachedProviders && now - cacheTimestamp < CACHE_TTL_MS) {
    return NextResponse.json({ providers: cachedProviders });
  }

  const basePresets: LlmProviderPreset[] = [...LLM_PROVIDER_PRESETS];
  const existingIds = new Set(basePresets.map((p) => p.id));

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch openrouter models");

    const json = await res.json();
    const models: { id: string, name: string }[] = json.data ?? [];

    const orProviders = new Map<string, string>();
    models.forEach((m) => {
      const parts = m.id.split('/');
      if (parts.length > 1) {
        const rawId = parts[0];
        if (!orProviders.has(rawId)) {
          const label = rawId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          orProviders.set(rawId, label);
        }
      }
    });

    orProviders.forEach((label, rawId) => {
      if (!existingIds.has(rawId)) {
        basePresets.push({
          id: rawId,
          label: `${label} (OpenRouter)`,
          baseURL: "https://openrouter.ai/api/v1",
          models: [],
          apiKeyPlaceholder: "sk-or-...",
          sdkProvider: "openai",
        });
        existingIds.add(rawId);
      }
    });
  } catch (err) {
    console.error("Failed to fetch dynamic providers from OpenRouter", err);
  }

  const originalLength = LLM_PROVIDER_PRESETS.length;
  const staticPart = basePresets.slice(0, originalLength);
  const dynamicPart = basePresets.slice(originalLength).sort((a, b) => a.label.localeCompare(b.label));

  const result = [...staticPart, ...dynamicPart];
  cachedProviders = result;
  cacheTimestamp = now;

  return NextResponse.json({ providers: result });
}
