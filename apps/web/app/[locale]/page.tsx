"use client";

import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useTranslations } from "next-intl";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@daemon/ui";
import { ChatEntryGate } from "@/src/components/chat-entry-gate";
import { useSession } from "@/src/hooks/use-session";
import { useTheme } from "@/src/hooks/use-theme";
import { supabaseBrowserClient } from "@/src/supabaseClient";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function HomePage() {
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const { session } = useSession();
  const { theme } = useTheme();
  const resolvedTheme = theme === "system" ? getSystemTheme() : theme;

  if (session) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8 sm:px-6">
        <section className="w-full space-y-5">
          <img
            src="/logo.png"
            alt="DaemonChat Logo"
            className="h-10 w-auto object-contain"
          />
          <Badge className="w-fit" variant="secondary">
            {tCommon("brand")}
          </Badge>
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl tracking-tight sm:text-3xl">
                {t("welcomeBack")}
              </CardTitle>
              <CardDescription>
                {t("account")}：{session.user?.email ?? session.user?.id}
              </CardDescription>
            </CardHeader>
          </Card>
          <ChatEntryGate />
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_400px]">
        <section className="space-y-6">
          <img
            src="/logo.png"
            alt="DaemonChat Logo"
            className="h-12 w-auto object-contain"
          />
          <Badge className="w-fit" variant="secondary">
            {tCommon("brand")}
          </Badge>

          <div className="space-y-4">
            <h1 className="whitespace-pre-line text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
              {t("title")}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("description")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("features.memory")}</CardTitle>
                <CardDescription>
                  跨会话持久记忆，AI 记住你的偏好、习惯和上下文。
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("features.multiModel")}</CardTitle>
                <CardDescription>
                  OpenAI、Anthropic、DeepSeek、Google 等主流模型自由切换。
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("features.templates")}</CardTitle>
                <CardDescription>
                  一键克隆社区 Agent 模板，快速构建专属助手。
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t("features.team")}</CardTitle>
                <CardDescription>
                  创建工作空间，邀请成员共享 Agent 与记忆。
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{tCommon("startUsing")}</CardTitle>
            <CardDescription>使用邮箱登录或注册。</CardDescription>
          </CardHeader>
          <CardContent>
            <Auth
              supabaseClient={supabaseBrowserClient}
              theme={resolvedTheme}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: "#2563eb",
                      brandAccent: "#1d4ed8",
                      inputBackground: "#ffffff",
                      inputBorder: "#e4e4e7",
                      inputBorderHover: "#2563eb",
                      inputBorderFocus: "#2563eb",
                      inputText: "#0d0d0d",
                      defaultButtonBackground: "#f0f0f1",
                      defaultButtonBackgroundHover: "#e4e4e7",
                      defaultButtonBorder: "#e4e4e7",
                      defaultButtonText: "#18181b",
                      anchorTextColor: "#2563eb",
                    },
                  },
                  dark: {
                    colors: {
                      brand: "#3b82f6",
                      brandAccent: "#2563eb",
                      inputBackground: "#232323",
                      inputBorder: "#333333",
                      inputBorderHover: "#3b82f6",
                      inputBorderFocus: "#3b82f6",
                      inputText: "#ededed",
                      defaultButtonBackground: "#2a2a2a",
                      defaultButtonBackgroundHover: "#333333",
                      defaultButtonBorder: "#333333",
                      defaultButtonText: "#ededed",
                      anchorTextColor: "#3b82f6",
                    },
                  },
                },
              }}
              providers={[]}
            />
          </CardContent>
        </Card>
      </div>

      <footer className="text-center text-xs text-muted-foreground">
        <a
          href="https://github.com/zhao-yangyang/daemonchat"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          GitHub
        </a>
        {" · "}
        <span>Built with ❤️</span>
      </footer>
    </main>
  );
}
