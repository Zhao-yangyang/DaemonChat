"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowserClient } from "@/src/supabaseClient";

type UseSessionResult = {
  session: Session | null;
  isResolved: boolean;
  user: Session["user"] | null;
};

export function useSession(): UseSessionResult {
  const [session, setSession] = useState<Session | null>(null);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    supabaseBrowserClient.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data.session ?? null);
        setIsResolved(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setSession(null);
        setIsResolved(true);
      });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setIsResolved(true);
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, isResolved, user: session?.user ?? null };
}
