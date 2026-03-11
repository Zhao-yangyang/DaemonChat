"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Button, Textarea, cn } from "@daemon/ui";
import { FileText, ImagePlus, Loader2, Send, X } from "lucide-react";

export type PendingAttachment = {
  file: File;
  preview: string;
  type: "image" | "pdf";
};

export type ChatComposerProps = {
  input: string;
  isStreaming: boolean;
  isUploading: boolean;
  uploadError: string | null;
  pendingAttachments: PendingAttachment[];
  modelLabel: string | undefined;
  onInputChange: (value: string) => void;
  onSend: () => Promise<void>;
  onStop: () => void;
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
  onRemoveAttachment: (idx: number) => void;
};

export function ChatComposer({
  input,
  isStreaming,
  isUploading,
  uploadError,
  pendingAttachments,
  modelLabel,
  onInputChange,
  onSend,
  onStop,
  onAttachmentsChange,
  onRemoveAttachment,
}: ChatComposerProps) {
  const t = useTranslations("chat");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const MAX = 10 * 1024 * 1024;
    const imageRe = /^image\/(jpeg|png|gif|webp)$/;
    const newAttachments: PendingAttachment[] = Array.from(files)
      .filter((f) => f.size <= MAX && (imageRe.test(f.type) || f.type === "application/pdf"))
      .map((file) =>
        imageRe.test(file.type)
          ? { file, preview: URL.createObjectURL(file), type: "image" as const }
          : { file, preview: "", type: "pdf" as const },
      );
    if (newAttachments.length > 0) {
      onAttachmentsChange([...pendingAttachments, ...newAttachments]);
    }
  };

  const canSend = (input.trim().length > 0 || pendingAttachments.length > 0) && !isUploading;

  return (
    <div className="shrink-0 border-t bg-card px-4 py-4 sm:px-6">
      <div className="mx-auto max-w-3xl">
        {/* Model badge */}
        <div className="mb-2 flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
              modelLabel
                ? "bg-secondary text-secondary-foreground"
                : "border-destructive/40 bg-destructive/5 text-destructive",
            )}
          >
            {modelLabel || t("notConfigured")}
          </span>
        </div>

        {/* Upload error */}
        {uploadError ? (
          <div className="px-1 pb-1 text-xs text-destructive">{uploadError}</div>
        ) : null}

        {/* Pending attachments */}
        {pendingAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="group relative">
                {att.type === "image" ? (
                  <img
                    src={att.preview}
                    alt={att.file.name}
                    className="size-16 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex size-16 flex-col items-center justify-center gap-1 rounded-lg border bg-muted/50 px-2">
                    <FileText className="size-6 text-muted-foreground" />
                    <span
                      className="truncate text-xs text-muted-foreground"
                      title={att.file.name}
                    >
                      {att.file.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onRemoveAttachment(i)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {/* Input row */}
        <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />

          {/* Attach button */}
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="shrink-0 rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming || isUploading}
            title={t("addImagePdf")}
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
          </Button>

          {/* Textarea */}
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={t("inputPlaceholder")}
            aria-label={t("inputPlaceholder")}
            className="min-h-10 max-h-40 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            data-testid="chat-input"
            onKeyDown={(e) => {
              if ((e.nativeEvent as KeyboardEvent).isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend();
              }
            }}
          />

          {/* Send / Stop button */}
          {isStreaming ? (
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 rounded-lg px-3 text-xs"
              onClick={onStop}
            >
              {t("stopGenerating")}
            </Button>
          ) : (
            <Button
              size="icon-sm"
              className="shrink-0 rounded-lg"
              onClick={() => void onSend()}
              disabled={!canSend}
              data-testid="chat-send"
            >
              <Send className="size-4" />
              <span className="sr-only">{t("send")}</span>
            </Button>
          )}
        </div>

        <p className="mt-2 text-center text-xs text-muted-foreground">{t("inputHint")}</p>
      </div>
    </div>
  );
}
