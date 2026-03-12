"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { useRouter } from "@/src/i18n/navigation";
import { trpc } from "@daemon/hooks";
import {
  Badge,
  Button,
  Input,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@daemon/ui";
import { DashboardShell } from "@/src/components/dashboard-shell";
import { supabaseBrowserClient } from "@/src/supabaseClient";
import {
  Archive,
  ArchiveRestore,
  FileDown,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { MessageBubble } from "@/src/components/chat/message-bubble";
import type { ChatMessage } from "@/src/components/chat/message-bubble";
import { ChatComposer } from "@/src/components/chat/chat-composer";
import type { PendingAttachment } from "@/src/components/chat/chat-composer";
import { SessionActionDialog } from "@/src/components/chat/session-action-dialog";
import type { SessionActionDialogState } from "@/src/components/chat/session-action-dialog";
import { SessionRenameDialog } from "@/src/components/chat/session-rename-dialog";
import type { SessionRenameDialogState } from "@/src/components/chat/session-rename-dialog";

const hasVisibleText = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const newSessionKey = () => `s-${Math.random().toString(36).slice(2, 10)}`;

const extractTextFragments = (value: unknown, depth = 0): string[] => {
  if (depth > 5) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTextFragments(item, depth + 1));
  }
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const preferredKeys = ["text", "content", "message", "value", "output_text"];
  const preferredFragments = preferredKeys.flatMap((key) =>
    extractTextFragments(record[key], depth + 1),
  );
  if (preferredFragments.length > 0) return preferredFragments;

  if (Array.isArray(record.parts)) {
    const partsFragments = extractTextFragments(record.parts, depth + 1);
    if (partsFragments.length > 0) return partsFragments;
  }

  return [];
};

const toMessageText = (content: unknown): string => {
  const extracted = extractTextFragments(content)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (extracted.length > 0) return extracted.join("\n");
  try {
    return JSON.stringify(content);
  } catch {
    return String(content ?? "");
  }
};

const toChatMessagesFromEvents = (
  events: Array<{
    id?: string;
    type: string;
    content: unknown;
    created_at?: string;
    createdAt?: string;
  }>,
): ChatMessage[] => {
  const items: ChatMessage[] = [];
  for (const event of events) {
    if (event.type !== "user_message" && event.type !== "assistant_message") continue;
    const text = toMessageText(event.content).trim();
    if (!text) continue;
    items.push({
      role: event.type === "user_message" ? "user" : "assistant",
      content: text,
      timestamp: event.created_at ?? event.createdAt ?? undefined,
      eventId: event.id,
    });
  }
  return items;
};

const toExportMarkdown = (items: ChatMessage[]): string =>
  items
    .map((item) => `## ${item.role === "user" ? "用户" : "AI"}\n\n${item.content.trim()}`)
    .join("\n\n---\n\n");

const safeFilePart = (value: string): string =>
  value
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
    .slice(0, 40) || "chat";

export default function ChatPage() {
  const t = useTranslations("chat");
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const router = useRouter();

  const [input, setInput] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [localSessionKeys, setLocalSessionKeys] = useState<string[]>([]);
  const [localSessionNames, setLocalSessionNames] = useState<Record<string, string>>({});
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());
  // Dialog state: replaces window.confirm / window.prompt
  const [sessionDialog, setSessionDialog] = useState<SessionActionDialogState | null>(null);
  const [renameDialog, setRenameDialog] = useState<SessionRenameDialogState | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [lastForkedSession, setLastForkedSession] = useState<{
    sessionKey: string;
    sessionId: string;
    parentSessionId: string;
    forkFromEventId: string;
  } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const activeStreamControllerRef = useRef<AbortController | null>(null);

  const agentList = trpc.agent.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const currentAgent = useMemo(
    () => (agentList.data ?? []).find((a) => a.id === agentId) ?? null,
    [agentList.data, agentId],
  );

  const sessionList = trpc.session.list.useQuery(
    { agentId, limit: 20, includeArchived: showArchived },
    { enabled: Boolean(agentId), refetchOnWindowFocus: false },
  );

  const currentSessionKey = sessionKey.trim();
  const messages = useMemo(
    () => messagesBySession[currentSessionKey] ?? [],
    [messagesBySession, currentSessionKey],
  );

  const selectedSession = useMemo(
    () => (sessionList.data ?? []).find((item) => item.sessionKey === currentSessionKey) ?? null,
    [currentSessionKey, sessionList.data],
  );
  const currentSessionId =
    selectedSession?.id ??
    (currentSessionKey === lastForkedSession?.sessionKey ? lastForkedSession.sessionId : "") ??
    "";

  const forkContext =
    (selectedSession?.parentSessionId && selectedSession?.forkFromEventId
      ? {
          parentSessionId: selectedSession.parentSessionId,
          forkFromEventId: selectedSession.forkFromEventId,
        }
      : null) ??
    (currentSessionKey === lastForkedSession?.sessionKey && lastForkedSession
      ? {
          parentSessionId: lastForkedSession.parentSessionId,
          forkFromEventId: lastForkedSession.forkFromEventId,
        }
      : null);

  const transcript = trpc.transcript.list.useQuery(
    {
      agentId,
      sessionId: currentSessionId,
      limit: 200,
      ...(forkContext ? forkContext : {}),
    },
    {
      enabled: Boolean(agentId && currentSessionId),
      refetchOnWindowFocus: false,
    },
  );

  const deleteSessionMutation = trpc.session.delete.useMutation({
    onSuccess: async () => {
      await sessionList.refetch();
    },
  });
  const renameSessionMutation = trpc.session.rename.useMutation({
    onSuccess: async () => {
      await sessionList.refetch();
    },
  });
  const archiveSessionMutation = trpc.session.archive.useMutation({
    onSuccess: async () => {
      await sessionList.refetch();
    },
  });
  const unarchiveSessionMutation = trpc.session.unarchive.useMutation({
    onSuccess: async () => {
      await sessionList.refetch();
    },
  });
  const forkSessionMutation = trpc.session.fork.useMutation({
    onSuccess: async (newSession) => {
      if (newSession.parentSessionId && newSession.forkFromEventId) {
        setLastForkedSession({
          sessionKey: newSession.sessionKey,
          sessionId: newSession.id,
          parentSessionId: newSession.parentSessionId,
          forkFromEventId: newSession.forkFromEventId,
        });
      }
      await sessionList.refetch();
      setLocalSessionKeys((prev) =>
        prev.includes(newSession.sessionKey) ? prev : [...prev, newSession.sessionKey],
      );
      setSessionKey(newSession.sessionKey);
      setMessagesBySession((prev) => ({ ...prev, [newSession.sessionKey]: [] }));
      toast.success(t("forkFromHere"));
    },
    onError: (err) => {
      toast.error(err.message || t("forkFailed"));
    },
  });

  const sessionKeys = useMemo(() => {
    const keys: string[] = [];
    const pushed = new Set<string>();
    for (const item of sessionList.data ?? []) {
      if (pushed.has(item.sessionKey)) continue;
      pushed.add(item.sessionKey);
      keys.push(item.sessionKey);
    }
    for (const key of localSessionKeys) {
      if (pushed.has(key)) continue;
      pushed.add(key);
      keys.push(key);
    }
    return keys;
  }, [localSessionKeys, sessionList.data]);

  useEffect(() => {
    const remoteKeys = new Set((sessionList.data ?? []).map((item) => item.sessionKey));
    if (remoteKeys.size === 0) return;
    setLocalSessionKeys((prev) => prev.filter((key) => !remoteKeys.has(key)));
  }, [sessionList.data]);

  useEffect(() => {
    if (sessionKeys.length === 0) return;
    if (!currentSessionKey || !sessionKeys.includes(currentSessionKey)) {
      setSessionKey(sessionKeys[0] ?? "");
    }
  }, [currentSessionKey, sessionKeys]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, currentSessionKey, isStreaming]);

  useEffect(() => {
    if (!currentSessionKey || !transcript.data) return;
    const restored = toChatMessagesFromEvents(transcript.data);
    if (restored.length === 0) return;
    setMessagesBySession((prev) => {
      const existing = prev[currentSessionKey] ?? [];
      if (existing.length > 0) return prev;
      return { ...prev, [currentSessionKey]: restored };
    });
  }, [currentSessionKey, transcript.data]);

  useEffect(() => {
    setEditingIndex(null);
    setEditingContent("");
    setExpandedMessages(new Set());
    if (currentSessionKey !== lastForkedSession?.sessionKey) {
      setLastForkedSession(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only reset on session switch
  }, [currentSessionKey]);

  const updateMessagesForSession = (
    targetSessionKey: string,
    updater: (items: ChatMessage[]) => ChatMessage[],
  ) => {
    setMessagesBySession((prev) => {
      const next = { ...prev };
      next[targetSessionKey] = updater(prev[targetSessionKey] ?? []);
      return next;
    });
  };

  const appendAssistant = (targetSessionKey: string, chunk: string) => {
    if (!chunk) return;
    updateMessagesForSession(targetSessionKey, (items) => {
      const next = [...items];
      const last = next[next.length - 1];
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, content: last.content + chunk };
      } else {
        next.push({ role: "assistant", content: chunk });
      }
      return next;
    });
  };

  const createSession = () => {
    const key = newSessionKey();
    setSessionKey(key);
    setLocalSessionKeys((prev) => (prev.includes(key) ? prev : [key, ...prev]));
    setLocalSessionNames((prev) => ({ ...prev, [key]: key }));
    setMessagesBySession((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
  };

  const removeSessionLocally = (targetKey: string) => {
    setMessagesBySession((prev) => {
      const next = { ...prev };
      delete next[targetKey];
      return next;
    });
    setLocalSessionNames((prev) => {
      const next = { ...prev };
      delete next[targetKey];
      return next;
    });
    setLocalSessionKeys((prev) => prev.filter((key) => key !== targetKey));
    const fallback = sessionKeys.find((key) => key !== targetKey) ?? "";
    setSessionKey(fallback);
  };

  const archiveCurrentSession = () => {
    if (!currentSessionKey) return;
    setSessionDialog({
      type: "archive",
      sessionKey: currentSessionKey,
      sessionId: currentSessionId,
    });
  };

  const unarchiveCurrentSession = () => {
    if (!currentSessionKey) return;
    setSessionDialog({
      type: "unarchive",
      sessionKey: currentSessionKey,
      sessionId: currentSessionId,
    });
  };

  const deleteCurrentSession = () => {
    if (!currentSessionKey) return;
    setSessionDialog({
      type: "delete",
      sessionKey: currentSessionKey,
      sessionId: currentSessionId,
    });
  };

  const executeSessionDialogAction = async () => {
    if (!sessionDialog) return;
    const { type, sessionKey: sk, sessionId } = sessionDialog;
    setSessionDialog(null);
    if (type === "archive") {
      if (!sessionId) {
        removeSessionLocally(sk);
        return;
      }
      await archiveSessionMutation.mutateAsync({ agentId, sessionId });
      removeSessionLocally(sk);
    } else if (type === "unarchive") {
      if (!sessionId) return;
      await unarchiveSessionMutation.mutateAsync({ agentId, sessionId });
      setShowArchived(false);
    } else if (type === "delete") {
      if (!sessionId) {
        removeSessionLocally(sk);
        return;
      }
      await deleteSessionMutation.mutateAsync({ agentId, sessionId });
      removeSessionLocally(sk);
    }
  };

  const runTurn = async (input: {
    targetSessionKey: string;
    userMessage: string;
    imageUrls?: Array<{ url: string; mimeType?: string }>;
  }) => {
    setIsStreaming(true);
    const controller = new AbortController();
    activeStreamControllerRef.current = controller;
    try {
      const session = await supabaseBrowserClient.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("未登录");

      const idempotencyKey = crypto.randomUUID();
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-access-token": accessToken,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          agentId,
          sessionKey: input.targetSessionKey,
          userInput: input.userMessage,
          system: "",
          idempotencyKey,
          imageUrls: input.imageUrls?.length ? input.imageUrls : undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`请求失败: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedAssistantChunk = false;

      const handleBlock = (block: string) => {
        const line = block.split("\n").find((entry) => entry.startsWith("data: "));
        if (!line) return;
        try {
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            value?: string;
            message?: string;
          };
          if (payload.type === "chunk") {
            if (hasVisibleText(payload.value)) receivedAssistantChunk = true;
            appendAssistant(input.targetSessionKey, payload.value ?? "");
          } else if (payload.type === "error") {
            appendAssistant(input.targetSessionKey, `\n错误: ${payload.message ?? "未知错误"}`);
          }
        } catch {
          // ignore malformed chunk
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        blocks.forEach(handleBlock);
      }

      if (!receivedAssistantChunk) {
        updateMessagesForSession(input.targetSessionKey, (items) => {
          const next = [...items];
          const last = next[next.length - 1];
          if (last?.role === "assistant" && !hasVisibleText(last.content)) {
            next[next.length - 1] = { ...last, content: "（模型返回空内容）" };
          }
          return next;
        });
      }

      sessionList.refetch();
      if (currentSessionId) transcript.refetch();
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "未知错误";
      toast.error(message);
      appendAssistant(input.targetSessionKey, `\n错误: ${message}`);
    } finally {
      if (activeStreamControllerRef.current === controller) {
        activeStreamControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  };

  const uploadAttachments = async (
    attachments: PendingAttachment[],
    activeSessionKey: string,
    accessToken: string,
  ): Promise<{ imageUrls: Array<{ url: string; mimeType?: string }>; pdfTexts: string[] }> => {
    const imageUrls: Array<{ url: string; mimeType?: string }> = [];
    const pdfTexts: string[] = [];
    for (const att of attachments) {
      const form = new FormData();
      form.append("file", att.file);
      form.append("agentId", agentId);
      form.append("sessionId", activeSessionKey);
      const resp = await fetch("/api/chat/upload", {
        method: "POST",
        headers: { "x-access-token": accessToken },
        body: form,
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          url: string;
          contentType?: string;
          textContent?: string;
        };
        if (att.type === "image") {
          imageUrls.push({ url: data.url, mimeType: data.contentType });
        } else if (att.type === "pdf" && data.textContent?.trim()) {
          pdfTexts.push(data.textContent.trim());
        }
      }
    }
    return { imageUrls, pdfTexts };
  };

  const send = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isStreaming || isUploading) return;

    setUploadError(null);

    const activeSessionKey = currentSessionKey || newSessionKey();
    if (!currentSessionKey) {
      setSessionKey(activeSessionKey);
      setLocalSessionKeys((prev) =>
        prev.includes(activeSessionKey) ? prev : [activeSessionKey, ...prev],
      );
    }
    const attachmentsToSend = [...pendingAttachments];
    setPendingAttachments([]);

    const hasImages = attachmentsToSend.some((a) => a.type === "image");
    const hasPdfs = attachmentsToSend.some((a) => a.type === "pdf");
    const baseUserMessage =
      input.trim() || (hasImages ? "请看这些图片" : hasPdfs ? "请根据文档内容回答" : "");

    const displayContent =
      attachmentsToSend.length > 0
        ? `${baseUserMessage}\n\n${attachmentsToSend
            .map((a) =>
              a.type === "image" ? `![${a.file.name}](${a.preview})` : `[${a.file.name}]`,
            )
            .join("\n")}`
        : baseUserMessage;

    setInput("");
    updateMessagesForSession(activeSessionKey, (items) => [
      ...items,
      { role: "user", content: displayContent, timestamp: new Date().toISOString() },
      { role: "assistant", content: "" },
    ]);

    let imageUrls: Array<{ url: string; mimeType?: string }> | undefined;
    let pdfTexts: string[] = [];
    if (attachmentsToSend.length > 0) {
      setIsUploading(true);
      try {
        const session = await supabaseBrowserClient.auth.getSession();
        const accessToken = session.data.session?.access_token;
        if (accessToken) {
          const result = await uploadAttachments(attachmentsToSend, activeSessionKey, accessToken);
          imageUrls = result.imageUrls.length > 0 ? result.imageUrls : undefined;
          pdfTexts = result.pdfTexts;
        }
      } catch {
        setUploadError(t("uploadError"));
        toast.error(t("uploadError"));
      } finally {
        setIsUploading(false);
      }
    }

    const userMessage =
      pdfTexts.length > 0
        ? `${baseUserMessage}\n\n[文档内容]\n${pdfTexts.join("\n\n")}`
        : baseUserMessage;

    await runTurn({ targetSessionKey: activeSessionKey, userMessage, imageUrls });
  };

  const regenerate = async () => {
    if (isStreaming || !currentSessionKey) return;
    const lastAssistantIndex = [...messages]
      .map((item, idx) => ({ item, idx }))
      .reverse()
      .find(({ item }) => item.role === "assistant" && hasVisibleText(item.content))?.idx;
    if (lastAssistantIndex === undefined || lastAssistantIndex <= 0) return;
    const previous = messages[lastAssistantIndex - 1];
    if (!previous || previous.role !== "user" || !hasVisibleText(previous.content)) return;

    updateMessagesForSession(currentSessionKey, (items) => {
      const next = [...items];
      next.splice(lastAssistantIndex, 1);
      next.push({ role: "assistant", content: "" });
      return next;
    });

    await runTurn({ targetSessionKey: currentSessionKey, userMessage: previous.content });
  };

  const startEdit = (idx: number, content: string) => {
    if (isStreaming) return;
    setEditingIndex(idx);
    setEditingContent(content);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingContent("");
  };

  const saveEditAndResend = async () => {
    if (isStreaming || editingIndex === null || !currentSessionKey) return;
    const edited = editingContent.trim();
    if (!edited) return;
    const index = editingIndex;
    const original = messages[index];
    if (!original || original.role !== "user") return;

    setEditingIndex(null);
    setEditingContent("");
    updateMessagesForSession(currentSessionKey, (items) => [
      ...items.slice(0, index),
      { role: "user", content: edited },
      { role: "assistant", content: "" },
    ]);
    await runTurn({ targetSessionKey: currentSessionKey, userMessage: edited });
  };

  const stopStreaming = () => {
    activeStreamControllerRef.current?.abort();
  };

  const getSessionLabel = (targetKey: string) => {
    const remote = (sessionList.data ?? []).find((item) => item.sessionKey === targetKey);
    const label = remote?.displayName?.trim() || localSessionNames[targetKey] || targetKey;
    return label || targetKey;
  };

  const renameCurrentSession = () => {
    if (!currentSessionKey) return;
    const currentName = getSessionLabel(currentSessionKey);
    setRenameInput(currentName);
    setRenameDialog({ sessionKey: currentSessionKey, currentName });
  };

  const executeRename = async () => {
    if (!renameDialog) return;
    const { sessionKey: sk, currentName } = renameDialog;
    const nextName = renameInput.trim();
    setRenameDialog(null);
    if (!nextName || nextName === currentName) return;
    if (!currentSessionId) {
      setLocalSessionNames((prev) => ({ ...prev, [sk]: nextName }));
      return;
    }
    await renameSessionMutation.mutateAsync({
      agentId,
      sessionId: currentSessionId,
      displayName: nextName,
    });
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const now = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `chat-${safeFilePart(currentAgent?.name ?? "agent")}-${safeFilePart(currentSessionKey || "session")}-${now}.md`;
    const blob = new Blob([toExportMarkdown(messages)], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(href);
  };

  const toggleExpand = (idx: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <DashboardShell
      title={currentAgent ? currentAgent.name : t("title")}
      description={t("description")}
      actions={
        <div className="flex items-center gap-2">
          {/* Agent + Session selectors */}
          <div className="flex min-w-0 shrink items-center gap-1.5 rounded-lg border bg-muted/30 px-1.5 py-0.5">
            <Select value={agentId} onValueChange={(id) => router.push(`/chat/${id}`)}>
              <SelectTrigger className="h-7 min-w-0 shrink border-0 bg-transparent text-xs shadow-none focus:ring-0 sm:w-[110px]">
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                {(agentList.data ?? []).map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground/60">/</span>
            {sessionKeys.length > 0 ? (
              <Select value={currentSessionKey || undefined} onValueChange={setSessionKey}>
                <SelectTrigger className="h-7 min-w-0 shrink border-0 bg-transparent text-xs shadow-none focus:ring-0 sm:w-[90px]">
                  <SelectValue placeholder="会话" />
                </SelectTrigger>
                <SelectContent>
                  {sessionKeys.map((key) => (
                    <SelectItem key={key} value={key}>
                      {getSessionLabel(key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="px-1 text-xs text-muted-foreground">{t("noSession")}</span>
            )}
          </div>

          <Button size="sm" onClick={createSession} disabled={isStreaming}>
            {t("newSession")}
          </Button>

          {isStreaming && (
            <Badge variant="secondary" className="text-xs">
              {t("streaming")}
            </Badge>
          )}

          {/* Session actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="size-8">
                <MoreVertical className="size-4" />
                <span className="sr-only">{t("sessionActionsLabel")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuCheckboxItem
                checked={showArchived}
                onCheckedChange={(v) => setShowArchived(!!v)}
              >
                <Archive className="size-3.5" />
                {t("showArchived")}
              </DropdownMenuCheckboxItem>
              {currentSessionKey ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void renameCurrentSession()}
                    disabled={renameSessionMutation.isPending || isStreaming}
                  >
                    {renameSessionMutation.isPending ? t("renaming") : t("renameSession")}
                  </DropdownMenuItem>
                  {currentSessionId && selectedSession?.isArchived ? (
                    <DropdownMenuItem
                      onClick={() => void unarchiveCurrentSession()}
                      disabled={unarchiveSessionMutation.isPending || isStreaming}
                    >
                      <ArchiveRestore className="size-3.5" />
                      {t("unarchive")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => void archiveCurrentSession()}
                      disabled={archiveSessionMutation.isPending || isStreaming}
                    >
                      <Archive className="size-3.5" />
                      {t("archive")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void deleteCurrentSession()}
                    disabled={deleteSessionMutation.isPending || isStreaming}
                  >
                    {deleteSessionMutation.isPending ? t("deleting") : t("deleteSession")}
                  </DropdownMenuItem>
                </>
              ) : null}
              {currentSessionId ? (
                <DropdownMenuItem
                  disabled={transcript.isFetching}
                  onClick={async () => {
                    const refreshed = await transcript.refetch();
                    const restored = toChatMessagesFromEvents(refreshed.data ?? []);
                    setMessagesBySession((prev) => ({ ...prev, [currentSessionKey]: restored }));
                  }}
                >
                  <RefreshCw className={cn("size-3.5", transcript.isFetching && "animate-spin")} />
                  {transcript.isFetching ? t("syncing") : t("syncHistory")}
                </DropdownMenuItem>
              ) : null}
              {messages.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSearchOpen((prev) => !prev)}>
                    <Search className="size-3.5" />
                    {t("searchMessages")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportChat}>
                    <FileDown className="size-3.5" />
                    {t("exportMarkdown")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      {/* Chat fills entire content area */}
      <div className="flex h-full flex-col">
        {/* Search bar */}
        {searchOpen ? (
          <div className="flex items-center gap-2 border-b bg-card px-4 py-2 sm:px-6">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="h-8 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              autoFocus
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}

        {/* Messages — min-h-0 lets this flex item shrink so input stays fixed at bottom */}
        <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1" data-testid="chat-messages">
          <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            {transcript.isLoading && messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Loader2 className="mb-4 size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("loadingHistory")}</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageIcon className="size-6 text-primary" />
                </div>
                <h2 className="text-lg font-medium text-foreground">{t("startNewChat")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("startNewChatHint")}</p>
              </div>
            ) : null}

            {transcript.error && messages.length === 0 ? (
              <div className="mx-auto max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm text-destructive">
                {t("loadHistoryFailed")}：{transcript.error.message}
                <Button
                  size="xs"
                  variant="outline"
                  className="ml-2"
                  onClick={() => void transcript.refetch()}
                >
                  {t("retry")}
                </Button>
              </div>
            ) : null}

            <div className="space-y-6">
              {messages.map((msg, idx) => {
                const hasVisibleContent = hasVisibleText(msg.content);
                const isLastAssistant =
                  msg.role === "assistant" && idx === messages.length - 1 && hasVisibleContent;
                return (
                  <MessageBubble
                    key={`${msg.role}-${idx}`}
                    msg={msg}
                    idx={idx}
                    isStreaming={isStreaming}
                    isLastAssistant={isLastAssistant}
                    searchQuery={searchQuery}
                    editingIndex={editingIndex}
                    editingContent={editingContent}
                    isExpanded={expandedMessages.has(idx)}
                    currentSessionId={currentSessionId}
                    isForkPending={forkSessionMutation.isPending}
                    onStartEdit={startEdit}
                    onCancelEdit={cancelEdit}
                    onSaveEditAndResend={saveEditAndResend}
                    onEditContentChange={setEditingContent}
                    onToggleExpand={toggleExpand}
                    onRegenerate={regenerate}
                    onFork={(eventId) =>
                      forkSessionMutation.mutate({
                        agentId,
                        parentSessionId: currentSessionId,
                        forkFromEventId: eventId,
                      })
                    }
                  />
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* Bottom composer */}
        <ChatComposer
          input={input}
          isStreaming={isStreaming}
          isUploading={isUploading}
          uploadError={uploadError}
          pendingAttachments={pendingAttachments}
          modelLabel={currentAgent?.config.llmProvider?.model || undefined}
          onInputChange={setInput}
          onSend={send}
          onStop={stopStreaming}
          onAttachmentsChange={setPendingAttachments}
          onRemoveAttachment={(i) =>
            setPendingAttachments((prev) => prev.filter((_, idx) => idx !== i))
          }
        />
      </div>

      <SessionActionDialog
        dialog={sessionDialog}
        sessionLabel={getSessionLabel(sessionDialog?.sessionKey ?? "")}
        isPending={
          archiveSessionMutation.isPending ||
          unarchiveSessionMutation.isPending ||
          deleteSessionMutation.isPending
        }
        onClose={() => setSessionDialog(null)}
        onConfirm={() => void executeSessionDialogAction()}
      />

      <SessionRenameDialog
        dialog={renameDialog}
        value={renameInput}
        isPending={renameSessionMutation.isPending}
        onClose={() => setRenameDialog(null)}
        onConfirm={() => void executeRename()}
        onChange={setRenameInput}
      />
    </DashboardShell>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
