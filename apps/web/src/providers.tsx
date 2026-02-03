"use client";

import { useEffect, useMemo, useState } from "react";
import { TrpcProvider } from "@daemon/hooks";
import { supabaseBrowserClient } from "./supabaseClient";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setAccessToken(data.session?.access_token ?? null);
    });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setAccessToken(session?.access_token ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const headers = useMemo(() => {
    if (!userId || !accessToken) return {};
    return {
      "x-user-id": userId,
      "x-access-token": accessToken,
    };
  }, [userId, accessToken]);

  return (
    <TrpcProvider key={userId ?? "anon"} headers={headers}>
      {children}
    </TrpcProvider>
  );
}
