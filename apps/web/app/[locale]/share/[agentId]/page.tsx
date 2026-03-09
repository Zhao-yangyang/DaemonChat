import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createContainer } from "@/src/server/container";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@daemon/ui";
import { Link } from "@/src/i18n/navigation";
import { MessageSquare } from "lucide-react";
import { ShareChatEmbed } from "@/src/components/share-chat-embed";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

const SITE_NAME = "DaemonChat";
const DESC_MAX_LEN = 160;

type Props = {
  params: Promise<{ locale: string; agentId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentId } = await params;
  const container = createContainer(env, undefined);
  const agent = await container.agent.getPublicAgent(agentId);

  if (!agent) {
    return { title: `${SITE_NAME}` };
  }

  const systemPrompt = (agent.config?.systemPrompt as string) ?? "";
  const description =
    systemPrompt.length > DESC_MAX_LEN
      ? `${systemPrompt.slice(0, DESC_MAX_LEN)}...`
      : systemPrompt || undefined;

  const title = `${agent.name} | ${SITE_NAME}`;

  return {
    title,
    description: description ?? undefined,
    openGraph: {
      title,
      description: description ?? undefined,
    },
  };
}

const ANONYMOUS_CHAT_ENABLED =
  process.env.ANONYMOUS_CHAT_ENABLED === "1" ||
  process.env.ANONYMOUS_CHAT_ENABLED === "true" ||
  process.env.ANONYMOUS_CHAT_ENABLED === "yes";
const ANONYMOUS_CHAT_MAX_TURNS = Math.min(
  10,
  Math.max(1, Number(process.env.ANONYMOUS_CHAT_MAX_TURNS) || 3)
);

export default async function ShareAgentPage({ params }: Props) {
  const { agentId } = await params;
  const t = await getTranslations("share");
  const container = createContainer(env, undefined);
  const agent = await container.agent.getPublicAgent(agentId);

  if (!agent) {
    notFound();
  }

  const systemPrompt = (agent.config?.systemPrompt as string) ?? "";
  const summary =
    systemPrompt.length > 200 ? `${systemPrompt.slice(0, 200)}...` : systemPrompt || t("noSystemPrompt");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">{agent.name}</CardTitle>
          <CardDescription>{t("publicAgentDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary ? (
            <p className="text-sm text-muted-foreground">{summary}</p>
          ) : null}
          {ANONYMOUS_CHAT_ENABLED ? (
            <ShareChatEmbed
              agentId={agent.id}
              agentName={agent.name}
              maxTurns={ANONYMOUS_CHAT_MAX_TURNS}
            />
          ) : (
            <>
              <Button asChild className="w-full">
                <Link href={`/chat/${agent.id}`} data-testid="share-try">
                  <MessageSquare className="mr-2 size-4" />
                  {t("try")}
                </Link>
              </Button>
              <p className="text-center text-xs text-muted-foreground">{t("loginHint")}</p>
            </>
          )}
        </CardContent>
      </Card>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/" data-testid="share-back">{t("backHome")}</Link>
      </Button>
    </main>
  );
}
