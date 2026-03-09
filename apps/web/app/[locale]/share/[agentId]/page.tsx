import { notFound } from "next/navigation";
import { createContainer } from "@/src/server/container";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@daemon/ui";
import { Link } from "@/src/i18n/navigation";
import { MessageSquare } from "lucide-react";

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY:
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

type Props = {
  params: Promise<{ locale: string; agentId: string }>;
};

export default async function ShareAgentPage({ params }: Props) {
  const { agentId } = await params;
  const container = createContainer(env, undefined);
  const agent = await container.agent.getPublicAgent(agentId);

  if (!agent) {
    notFound();
  }

  const systemPrompt = (agent.config?.systemPrompt as string) ?? "";
  const summary =
    systemPrompt.length > 200 ? `${systemPrompt.slice(0, 200)}...` : systemPrompt || "（无系统提示）";

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">{agent.name}</CardTitle>
          <CardDescription>公开分享的 Agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary ? (
            <p className="text-sm text-muted-foreground">{summary}</p>
          ) : null}
          <Button asChild className="w-full">
            <Link href={`/chat/${agent.id}`}>
              <MessageSquare className="mr-2 size-4" />
              试用
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            登录后即可与此 Agent 对话
          </p>
        </CardContent>
      </Card>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}
