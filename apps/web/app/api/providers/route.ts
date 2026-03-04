import { NextResponse } from "next/server";
import { LLM_PROVIDER_PRESETS } from "@daemon/domain";

export async function GET() {
  const basePresets = [...LLM_PROVIDER_PRESETS];
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
          // Capitalize like "Meta-Llama" or "Google"
          const label = rawId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          orProviders.set(rawId, label);
        }
      }
    });

    orProviders.forEach((label, rawId) => {
      const mappedId = rawId === "mistralai" ? "mistral" : rawId === "x-ai" ? "xai" : rawId === "moonshotai" ? "moonshot" : rawId;
      
      if (!existingIds.has(mappedId)) {
        basePresets.push({
          id: mappedId,
          label: `${label} (OpenRouter)`,
          baseURL: "https://openrouter.ai/api/v1",
          models: [], 
          apiKeyPlaceholder: "sk-or-...",
          sdkProvider: "openai",
        });
        existingIds.add(mappedId);
      }
    });
  } catch (err) {
    console.error("Failed to fetch dynamic providers from OpenRouter", err);
  }

  // Sort base presets to top, then dynamic ones mapped alphabetically
  const originalLength = LLM_PROVIDER_PRESETS.length;
  const staticPart = basePresets.slice(0, originalLength);
  const dynamicPart = basePresets.slice(originalLength).sort((a, b) => a.label.localeCompare(b.label));

  return NextResponse.json({ providers: [...staticPart, ...dynamicPart] });
}
