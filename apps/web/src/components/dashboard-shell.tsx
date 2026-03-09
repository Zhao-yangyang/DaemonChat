"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@daemon/ui";
import {
  Menu,
  MessageSquare,
  Bot,
  Brain,
  FileText,
  BarChart3,
  LogOut,
  LayoutGrid,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { LanguageSwitcher } from "@/src/components/language-switcher";
import { Link, usePathname } from "@/src/i18n/navigation";
import { useSession } from "@/src/hooks/use-session";
import { supabaseBrowserClient } from "@/src/supabaseClient";

const navItems: Array<{
  key: string;
  href: string;
  icon: React.ElementType;
}> = [
  { key: "chat", href: "/chat", icon: MessageSquare },
  { key: "agents", href: "/agents", icon: Bot },
  { key: "memory", href: "/memory", icon: Brain },
  { key: "transcripts", href: "/transcripts", icon: FileText },
  { key: "usage", href: "/usage", icon: BarChart3 },
  { key: "templates", href: "/templates", icon: LayoutGrid },
  { key: "workspaces", href: "/workspaces", icon: Users },
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

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const { session, user } = useSession();
  const email = user?.email;
  const displayName = email ? email.split("@")[0] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight"
          onClick={onNavigate}
        >
          <img
            src="/logo.png"
            alt="DaemonChat Logo"
            className="size-6 object-contain"
          />
          {tCommon("brand")}
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
              }`}
            >
              <Icon className="size-[18px]" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="flex items-center gap-1 px-3 py-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <div className="space-y-2 px-3 py-4">
        {displayName ? (
          <p
            className="truncate text-xs text-muted-foreground"
            title={email ?? undefined}
          >
            {displayName}
          </p>
        ) : null}
        {session ? (
          <button
            onClick={async () => {
              onNavigate?.();
              await supabaseBrowserClient.auth.signOut();
              window.location.href = pathname.startsWith("/en") ? "/en" : "/zh";
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
          >
            <LogOut className="size-4" />
            退出登录
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardShell({
  title,
  description,
  actions,
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-[240px] shrink-0 border-r bg-sidebar md:block">
        <SidebarNav pathname={pathname} />
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-2 border-b bg-card px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 md:px-6">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden">
                <Menu className="size-5" />
                <span className="sr-only">打开菜单</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] bg-sidebar p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>导航</SheetTitle>
              </SheetHeader>
              <SidebarNav
                pathname={pathname}
                onNavigate={() => setSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold sm:text-base">
                {title}
              </h1>
              <p className="hidden truncate text-sm text-muted-foreground sm:block">
                {description}
              </p>
            </div>
            {actions ? (
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
      </div>
    </div>
  );
}
