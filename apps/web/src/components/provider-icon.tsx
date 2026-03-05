"use client";

import { useMemo } from "react";
import { Cpu } from "lucide-react";
import { cn } from "@daemon/ui";
import { ModelProvider, ProviderIcon as LobeProviderIcon } from "@lobehub/icons";

const MP = ModelProvider as Record<string, string>;
const PROVIDER_VALUES = Object.values(MP) as string[];

/** value -> enum key，用于以 ModelProvider.XXX 形式传参 */
const VALUE_TO_KEY: Record<string, keyof typeof ModelProvider> = {};
for (const [k, v] of Object.entries(MP)) {
  if (typeof v === "string") VALUE_TO_KEY[v] = k as keyof typeof ModelProvider;
}

/** 规范化：带中划线/下划线/点号 → 大驼峰，否则保持小写 */
function normalize(id: string): string {
  const parts = (id ?? "")
    .trim()
    .split(/[\s\-_\.]+/)
    .filter(Boolean);
  if (parts.length <= 1) return parts[0]?.toLowerCase() ?? "";
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}

/** 模糊匹配 ModelProvider，返回 enum 成员（用于 provider={ModelProvider.XXX}） */
function resolveProvider(normalized: string): keyof typeof ModelProvider | null {
  const lower = normalized.toLowerCase();
  // 直接 key 匹配（如 PascalCase 的 "OpenAI"）
  if (normalized in MP && typeof MP[normalized] === "string")
    return normalized as keyof typeof ModelProvider;
  let value: string | null = null;
  if (PROVIDER_VALUES.includes(lower)) {
    value = lower;
  } else if (lower.length >= 2) {
    value =
      PROVIDER_VALUES.find(
        (v) => v.includes(lower) && v.length <= lower.length + 4
      ) ?? null;
  }
  if (!value) {
    const contained = PROVIDER_VALUES.filter((v) => lower.includes(v));
    value = contained.length ? contained.reduce((a, b) => (a.length > b.length ? a : b)) : null;
  }
  return value ? (VALUE_TO_KEY[value] ?? null) : null;
}

export function ProviderIcon({
  providerId,
  size = 18,
  className,
}: {
  providerId: string;
  size?: number;
  className?: string;
}) {
  const raw = (providerId ?? "").trim();
  if (!raw || raw.toLowerCase() === "__custom__") {
    return (
      <Cpu
        className={cn("shrink-0 text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  const providerKey = useMemo(() => resolveProvider(normalize(raw)), [raw]);
  return (
    <span
      className={cn("shrink-0 inline-flex items-center justify-center", className)}
      style={{ width: size, height: size, lineHeight: 1 }}
    >
      <LobeProviderIcon
        provider={providerKey ? ModelProvider[providerKey] : (normalize(raw) as never)}
        size={size}
        type="color"
      />
    </span>
  );
}
