"use client";

import { useEffect, useMemo, useState } from "react";
import { TrpcProvider } from "@daemon/hooks";
import { TooltipProvider } from "@daemon/ui";
import { supabaseBrowserClient } from "./supabaseClient";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
    });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const headers = useMemo<Record<string, string>>(() => {
    if (!accessToken) return {} as Record<string, string>;
    return {
      "x-access-token": accessToken,
    };
  }, [accessToken]);

  return (
    <TrpcProvider key={accessToken ?? "anon"} headers={headers}>
      <TooltipProvider>{children}</TooltipProvider>
    </TrpcProvider>
  );
}
