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
    <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-[var(--line-soft)] bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/" className="text-base font-semibold tracking-tight text-[var(--ink-strong)]">
              DaemonChat
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="max-w-[52vw] truncate border-[var(--line-soft)] bg-white text-[var(--ink-muted)]"
              >
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

          <nav className="flex flex-wrap items-center gap-2">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--ink-strong)]"
                      : "border-[var(--line-soft)] bg-white text-[var(--ink-muted)] hover:text-[var(--ink-strong)]"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--line-soft)] bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-strong)] sm:text-3xl">
              {title}
            </h1>
            <p className="text-sm text-[var(--ink-muted)]">{description}</p>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      </section>

      {children}
    </main>
  );
}
