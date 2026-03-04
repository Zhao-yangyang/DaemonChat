import { NextRequest, NextResponse } from "next/server";

interface ModelItem {
  id: string;
  name: string;
}

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  "openai",
  "deepseek",
  "xai",
  "mistral",
  "moonshot",
  "openrouter",
]);

const NON_CHAT_PATTERNS = /^(text-embedding|embedding|tts|whisper|dall-e|davinci|babbage|ada|curie)/i;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 无需鉴权的 OpenRouter 兜底接口，获取最新模型数据
async function fetchFromOpenRouterPublic(sdkProvider: string, providerId?: string): Promise<ModelItem[]> {
  const res = await fetchWithTimeout("https://openrouter.ai/api/v1/models", {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data: Array<{ id: string; name: string }> = json.data ?? [];
  
  let filterPrefix = "";
  if (providerId && providerId !== "openrouter" && providerId !== "__custom__") {
    // Some reverse mapping for the raw OpenRouter IDs
    const rawId = providerId === "mistral" ? "mistralai" : providerId === "xai" ? "x-ai" : providerId === "moonshot" ? "moonshotai" : providerId;
    filterPrefix = `${rawId}/`;
  } else if (sdkProvider === "openai") {
    filterPrefix = "openai/";
  } else if (sdkProvider === "anthropic") {
    filterPrefix = "anthropic/";
  } else if (sdkProvider === "google") {
    filterPrefix = "google/";
  } else if (sdkProvider === "deepseek") {
    filterPrefix = "deepseek/";
  } else if (sdkProvider === "mistral") {
    filterPrefix = "mistral/";
  } else if (sdkProvider === "xai") {
    filterPrefix = "x-ai/";
  }

  let models = data;
  if (filterPrefix && sdkProvider !== "openrouter") {
    models = models.filter(m => m.id.startsWith(filterPrefix)).map(m => ({
      // Only visually replace for well-known native SDK providers,
      // but if the user uses a dynamic provider through OpenRouter, we shouldn't strip it 
      // otherwise OpenRouter will reject the model call `llama-3` instead of `meta-llama/llama-3`.
      // Actually, OpenRouter handles naked models occasionally, but it's safer to keep the ID format intact unless it's a native proxy.
      id: providerId ? m.id : m.id.replace(filterPrefix, ""),
      name: m.name
    }));
  } else if (sdkProvider === "openrouter" || providerId === "openrouter") {
    models = data;
  }

  return models
    .filter((m) => !NON_CHAT_PATTERNS.test(m.id))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchOpenAICompatible(
  baseURL: string,
  apiKey: string
): Promise<ModelItem[]> {
  let normBase = baseURL.replace(/\/+$/, "");
  if (!normBase.endsWith("/v1") && !normBase.includes("openrouter")) {
    if (
      normBase === "https://api.deepseek.com" ||
      normBase === "https://api.mistral.ai" ||
      normBase === "https://api.x.ai"
    ) {
      normBase = `${normBase}/v1`;
    }
  }

  const url = `${normBase}/models`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data: Array<{ id: string }> = json.data ?? [];
  return data
    .filter((m) => !NON_CHAT_PATTERNS.test(m.id))
    .map((m) => ({ id: m.id, name: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchAnthropic(apiKey: string): Promise<ModelItem[]> {
  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/models",
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const data: Array<{ id: string; display_name?: string }> = json.data ?? [];
  return data
    .map((m) => ({ id: m.id, name: m.display_name || m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchGoogle(
  baseURL: string,
  apiKey: string
): Promise<ModelItem[]> {
  const url = `${baseURL.replace(/\/+$/, "")}/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const models: Array<{
    name: string;
    displayName?: string;
    supportedGenerationMethods?: string[];
  }> = json.models ?? [];
  return models
    .filter((m) =>
      m.supportedGenerationMethods?.includes("generateContent")
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ""),
      name: m.displayName || m.name.replace(/^models\//, ""),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ models: [], error: "Invalid JSON body" }, { status: 400 });
  }

  const { sdkProvider, apiKey, baseURL, providerId } = body as {
    sdkProvider?: string;
    apiKey?: string;
    baseURL?: string;
    providerId?: string;
  };

  if (!sdkProvider) {
    return NextResponse.json(
      { models: [], error: "Missing sdkProvider" },
      { status: 400 }
    );
  }

  // 1. 无 API Key 获取，走 OpenRouter 公开获取模型列表兜底机制
  if (!apiKey || (baseURL && baseURL.includes('openrouter'))) {
    try {
      const models = await fetchFromOpenRouterPublic(sdkProvider, providerId);
      return NextResponse.json({ models });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fetch public models failed";
      return NextResponse.json({ models: [], error: message });
    }
  }

  // 2. 有 API Key 时，首先尝试官方接口以保证时效性和准确性
  try {
    let models: ModelItem[];
    if (sdkProvider === "anthropic") {
      models = await fetchAnthropic(apiKey);
    } else if (sdkProvider === "google") {
      models = await fetchGoogle(
        baseURL || "https://generativelanguage.googleapis.com/v1beta",
        apiKey
      );
    } else if (OPENAI_COMPATIBLE_PROVIDERS.has(sdkProvider)) {
      if (!baseURL) {
        return NextResponse.json(
          { models: [], error: "Missing baseURL" },
          { status: 400 }
        );
      }
      models = await fetchOpenAICompatible(baseURL, apiKey);
    } else {
      if (baseURL) {
        models = await fetchOpenAICompatible(baseURL, apiKey);
      } else {
        return NextResponse.json(
          { models: [], error: `Unsupported provider: ${sdkProvider}` },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ models });
  } catch (err) {
    // 3. 官方请求（带 API Key）失败时（例如 API Key 填写不对跑去请求提供商返回 401），
    //    我们也可以降级用 OpenRouter 接口获取显示列表，
    //    这样即便刚才手滑填错，弹出的下拉框里仍能刷新出新模型体验极佳。
    try {
      const fallbackModels = await fetchFromOpenRouterPublic(sdkProvider, providerId);
      return NextResponse.json({ models: fallbackModels });
    } catch {}

    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ models: [], error: message });
  }
}
