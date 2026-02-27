"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, cn } from "@daemon/ui";
import { supabaseBrowserClient } from "@/src/supabaseClient";

const navItems: Array<{ label: string; href: string }> = [
  { label: "Agents", href: "/agents" },
  { label: "Chat", href: "/chat" },
  { label: "Memory", href: "/memory" },
  { label: "Transcripts", href: "/transcripts" },
  { label: "Usage", href: "/usage" },
];

const isActive = (pathname: string, href: string): boolean => {
  if (href === "/chat") {
    return pathname === "/chat" || pathname.startsWith("/chat/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
};

type DashboardShellProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function DashboardShell({ title, description, actions, children }: DashboardShellProps) {
  const pathname = usePathname();
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

  const userLabel = useMemo(
    () => session?.user?.email ?? session?.user?.id ?? "未登录",
    [session]
  );

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-[var(--line-soft)] bg-white/75 p-4 shadow-[0_12px_40px_rgba(24,38,64,0.08)] backdrop-blur-lg sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[0.08em] text-[var(--ink-strong)]"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">
                D
              </span>
              DaemonChat
            </Link>
            <p className="text-xs text-[var(--ink-muted)]">Long-term assistant control plane</p>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                    active
                      ? "bg-[var(--brand)] text-white shadow-[0_8px_24px_rgba(24,86,255,0.35)]"
                      : "bg-white/70 text-[var(--ink-muted)] hover:bg-white hover:text-[var(--ink-strong)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-[var(--line-soft)] bg-white/80 text-[var(--ink-muted)]">
              {userLabel}
            </Badge>
            {session ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => supabaseBrowserClient.auth.signOut()}
                className="border-[var(--line-soft)] bg-white"
              >
                退出
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-3xl border border-[var(--line-soft)] bg-[linear-gradient(125deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92),rgba(248,244,236,0.92))] p-6 shadow-[0_20px_48px_rgba(24,38,64,0.08)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgba(24,86,255,0.3),rgba(24,86,255,0.02)_70%)]" />
        <div className="pointer-events-none absolute -bottom-20 left-0 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(242,176,61,0.2),rgba(242,176,61,0.02)_72%)]" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <h1 className="font-display text-3xl font-semibold leading-tight text-[var(--ink-strong)] sm:text-4xl">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-[var(--ink-muted)] sm:text-base">{description}</p>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </section>

      {children}
    </main>
  );
}
