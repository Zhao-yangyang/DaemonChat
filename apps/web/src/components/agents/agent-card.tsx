"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/src/i18n/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@daemon/ui";
import { ProviderIcon } from "@/src/components/provider-icon";
import { formatId } from "@/src/lib/format";

export type AgentCardAgent = {
  id: string;
  name: string;
  visibility?: "private" | "workspace" | "public";
  config: {
    systemPrompt: string;
    memoryTopK: number;
    recentMessages: number;
    temperature: number;
    llmProvider?: {
      model?: string;
      baseURL?: string;
      apiKey?: string;
      presetId?: string;
      sdkProvider?: "openai" | "anthropic" | "google" | "deepseek" | "xai" | "mistral";
    } | null;
  };
};

export type AgentCardProps = {
  agent: AgentCardAgent;
  isPublished: boolean;
  isDeletePending: boolean;
  onConfigOpen: (agent: AgentCardAgent) => void;
  onDeleteOpen: (agentId: string) => void;
  onPublishOpen: (agentId: string) => void;
};

export function AgentCard({
  agent,
  isPublished,
  isDeletePending,
  onConfigOpen,
  onDeleteOpen,
  onPublishOpen,
}: AgentCardProps) {
  const t = useTranslations("agents");

  return (
    <Card className="transition-shadow hover:shadow-md" data-testid={`agent-card-${agent.id}`}>
      <CardContent className="flex items-center justify-between gap-4 py-4">
        {/* Left: name + model + id */}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {agent.name}
            {isPublished ? (
              <Badge variant="secondary" className="text-xs">
                {t("published")}
              </Badge>
            ) : null}
            <span className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2 py-0.5 text-xs font-normal text-muted-foreground">
              <ProviderIcon
                providerId={
                  agent.config.llmProvider?.presetId &&
                  agent.config.llmProvider.presetId !== "__custom__"
                    ? agent.config.llmProvider.presetId
                    : (agent.config.llmProvider?.sdkProvider ?? "")
                }
                size={14}
              />
              {agent.config.llmProvider?.model || t("notConfigured")}
            </span>
          </p>

          <Tooltip>
            <TooltipTrigger asChild>
              <p className="cursor-default text-xs text-muted-foreground">{formatId(agent.id)}</p>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono text-xs">{agent.id}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Right: action buttons */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild size="sm" data-testid="agent-chat-btn">
            <Link href={`/chat/${agent.id}`}>{t("chat")}</Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onConfigOpen(agent)}
            data-testid="agent-config-btn"
          >
            {t("config")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeleteOpen(agent.id)}
            disabled={isDeletePending}
            data-testid="agent-delete-btn"
          >
            {t("delete")}
          </Button>

          <Button asChild variant="ghost" size="sm">
            <Link href={`/usage?agent=${encodeURIComponent(agent.id)}`}>{t("usage")}</Link>
          </Button>

          <Button asChild variant="ghost" size="sm">
            <Link href={`/memory?agent=${encodeURIComponent(agent.id)}`}>{t("memory")}</Link>
          </Button>

          <Button variant="ghost" size="sm" onClick={() => onPublishOpen(agent.id)}>
            {isPublished ? t("updatePublish") : t("publish")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
