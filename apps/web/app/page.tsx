"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabaseBrowserClient } from "@/src/supabaseClient";
import { Card } from "@daemon/ui";

export default function HomePage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: listener } = supabaseBrowserClient.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <main>
      <h1>DaemonChat</h1>
      <p>AI 长期助手 MVP</p>

      {session ? (
        <Card>
          <p>已登录：{session.user?.email ?? session.user?.id}</p>
          <nav style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <Link href="/agents">Agents</Link>
            <Link href="/chat">Chat</Link>
            <Link href="/memory">Memory</Link>
            <Link href="/transcripts">Transcripts</Link>
          </nav>
          <button
            style={{ marginTop: 16 }}
            onClick={() => supabaseBrowserClient.auth.signOut()}
          >
            退出登录
          </button>
        </Card>
      ) : (
        <Card>
          <Auth
            supabaseClient={supabaseBrowserClient}
            appearance={{ theme: ThemeSupa }}
            providers={[]}
          />
        </Card>
      )}
    </main>
  );
}
