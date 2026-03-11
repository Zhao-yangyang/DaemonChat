"use client";

import { useTranslations } from "next-intl";
import { Button, Textarea, cn } from "@daemon/ui";
import { Loader2 } from "lucide-react";
import { MarkdownMessage } from "@/src/components/markdown-message";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  eventId?: string;
};

const formatMsgTime = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const hasVisibleText = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

export type MessageBubbleProps = {
  msg: ChatMessage;
  idx: number;
  isStreaming: boolean;
  isLastAssistant: boolean;
  searchQuery: string;
  editingIndex: number | null;
  editingContent: string;
  isExpanded: boolean;
  currentSessionId: string;
  isForkPending: boolean;
  onStartEdit: (idx: number, content: string) => void;
  onCancelEdit: () => void;
  onSaveEditAndResend: () => Promise<void>;
  onEditContentChange: (content: string) => void;
  onToggleExpand: (idx: number) => void;
  onRegenerate: () => Promise<void>;
  onFork: (eventId: string) => void;
};

export function MessageBubble({
  msg,
  idx,
  isStreaming,
  isLastAssistant,
  searchQuery,
  editingIndex,
  editingContent,
  isExpanded,
  currentSessionId,
  isForkPending,
  onStartEdit,
  onCancelEdit,
  onSaveEditAndResend,
  onEditContentChange,
  onToggleExpand,
  onRegenerate,
  onFork,
}: MessageBubbleProps) {
  const t = useTranslations("chat");

  const isUser = msg.role === "user";
  const hasVisibleContent = hasVisibleText(msg.content);
  const isPendingAssistant = !isUser && !hasVisibleContent && isStreaming;
  const isEditing = editingIndex === idx;

  // Don't render invisible assistant placeholders
  if (!isUser && !hasVisibleContent && !isPendingAssistant) return null;

  // Filter by search query
  if (
    searchQuery.trim() &&
    !msg.content.toLowerCase().includes(searchQuery.trim().toLowerCase())
  ) {
    return null;
  }

  const timeLabel = formatMsgTime(msg.timestamp);
  const isLong = !isUser && msg.content.length > 2000;
  const shouldCollapse = isLong && !isExpanded;

  return (
    <div className={cn("space-y-1", isUser && "items-end")}>
      <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
        {/* Avatar circle */}
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {isUser ? t("userLabel") : t("aiLabel")}
        </div>

        {/* Message bubble */}
        <div
          className={cn("min-w-0 flex-1 flex flex-col", isUser ? "items-end" : "items-start")}
        >
          <div
            className={cn(
              "inline-block max-w-[min(85%,42rem)] rounded-2xl px-4 py-3",
              isUser
                ? "bg-primary text-primary-foreground text-sm leading-relaxed"
                : "bg-muted text-foreground",
            )}
          >
            {isUser ? (
              isEditing ? (
                /* Edit mode */
                <div className="space-y-2">
                  <Textarea
                    value={editingContent}
                    onChange={(e) => onEditContentChange(e.target.value)}
                    className="min-h-20 resize-y bg-background text-foreground"
                    aria-label={t("editAriaLabel")}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="xs" variant="secondary" onClick={onCancelEdit}>
                      {t("cancel")}
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => void onSaveEditAndResend()}
                      disabled={!editingContent.trim()}
                    >
                      {t("saveResend")}
                    </Button>
                  </div>
                </div>
              ) : (
                /* Normal user message */
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )
            ) : hasVisibleContent ? (
              /* Assistant markdown message */
              <>
                <div className={shouldCollapse ? "max-h-96 overflow-hidden" : undefined}>
                  <MarkdownMessage content={msg.content} />
                </div>
                {isLong ? (
                  <button
                    className="mt-2 text-xs text-primary hover:underline"
                    onClick={() => onToggleExpand(idx)}
                  >
                    {isExpanded ? t("collapse") : t("expand")}
                  </button>
                ) : null}
              </>
            ) : isPendingAssistant ? (
              /* Thinking spinner */
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <span>{t("thinking")}</span>
              </div>
            ) : null}
          </div>

          {/* Timestamp + inline action buttons */}
          <div
            className={cn(
              "mt-1 flex items-center gap-2 text-[11px] text-muted-foreground",
              isUser && "flex-row-reverse",
            )}
          >
            {timeLabel ? <span>{timeLabel}</span> : null}

            {isUser && !isEditing && !isStreaming ? (
              <button
                className="transition-colors hover:text-foreground"
                onClick={() => onStartEdit(idx, msg.content)}
              >
                {t("edit")}
              </button>
            ) : null}

            {!isUser && hasVisibleContent && !isStreaming ? (
              <button
                className="transition-colors hover:text-foreground"
                onClick={() => void navigator.clipboard.writeText(msg.content)}
              >
                {t("copy")}
              </button>
            ) : null}

            {!isUser && isLastAssistant && !isStreaming ? (
              <button
                className="transition-colors hover:text-foreground"
                onClick={() => void onRegenerate()}
              >
                {t("regenerate")}
              </button>
            ) : null}

            {msg.eventId && currentSessionId && !isStreaming ? (
              <button
                className="transition-colors hover:text-foreground"
                data-testid="chat-fork"
                onClick={() => onFork(msg.eventId!)}
                disabled={isForkPending}
              >
                {t("forkFromHere")}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
