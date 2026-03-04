"use client";

import { ProviderIcon as LobeProviderIcon } from "@lobehub/icons";

export function ProviderIcon({
  providerId,
  size = 18,
}: {
  providerId: string;
  size?: number;
}) {
  return <LobeProviderIcon provider={providerId as any} size={size} type="color" />;
}
