"use client";

import { Cpu } from "lucide-react";
import { cn } from "@daemon/ui";
import { ModelIcon as LobeModelIcon } from "@lobehub/icons";
import { ProviderIcon } from "./provider-icon";

/**
 * Renders model icon with fallbacks:
 * - OpenRouter "provider/model" format -> ProviderIcon(provider) for reliable display
 * - Simple model id (gpt-4o, claude-*) -> Lobe ModelIcon
 * - Fallback: generic Cpu icon
 */
export function ModelIcon({
  modelId,
  size = 24,
  type = "avatar",
  className,
}: {
  modelId: string;
  size?: number;
  type?: "avatar" | "color" | "mono";
  className?: string;
}) {
  const id = (modelId ?? "").trim();
  if (!id) {
    return (
      <Cpu
        className={cn("shrink-0 text-muted-foreground", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  // OpenRouter format "provider/model" -> use ProviderIcon (more reliable than ModelIcon for prefixed ids)
  const slashIdx = id.indexOf("/");
  if (slashIdx > 0) {
    const providerPart = id.slice(0, slashIdx);
    return (
      <span
        className={cn("shrink-0 inline-flex items-center justify-center rounded-md bg-muted/30", className)}
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <ProviderIcon providerId={providerPart} size={Math.round(size * 0.75)} />
      </span>
    );
  }

  return (
    <span
      className={cn("shrink-0 inline-flex items-center justify-center overflow-hidden rounded-md", className)}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      <LobeModelIcon model={id} size={size} type={type} />
    </span>
  );
}
