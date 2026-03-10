import * as Sentry from "@sentry/nextjs";

type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const alertLevelRank: Record<LogLevel, number> = {
  info: 1,
  warn: 2,
  error: 3,
};

const parseAlertMinLevel = (value: string | undefined): LogLevel => {
  if (value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return "error";
};

const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL ?? "";
const alertMinLevel = parseAlertMinLevel(process.env.ALERT_MIN_LEVEL);
const ALERT_TIMEOUT_MS = 5000;
const ALERT_MAX_RETRIES = 1;
const ALERT_SUPPRESS_WINDOW_MS = 60_000;
const ALERT_SUPPRESS_MAX = 5;

const alertSuppressionMap = new Map<string, { count: number; firstAt: number }>();

const isAlertSuppressed = (event: string): boolean => {
  const now = Date.now();
  const entry = alertSuppressionMap.get(event);
  if (!entry || now - entry.firstAt > ALERT_SUPPRESS_WINDOW_MS) {
    alertSuppressionMap.set(event, { count: 1, firstAt: now });
    return false;
  }
  entry.count++;
  return entry.count > ALERT_SUPPRESS_MAX;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const sendAlert = async (level: LogLevel, event: string, fields: LogFields) => {
  if (!alertWebhookUrl) return;
  if (alertLevelRank[level] < alertLevelRank[alertMinLevel]) return;
  if (isAlertSuppressed(event)) return;

  const body = JSON.stringify({
    source: "web",
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  });

  for (let attempt = 0; attempt <= ALERT_MAX_RETRIES; attempt++) {
    try {
      await fetchWithTimeout(
        alertWebhookUrl,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
        ALERT_TIMEOUT_MS,
      );
      return;
    } catch (error) {
      if (attempt >= ALERT_MAX_RETRIES) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          JSON.stringify({
            level: "error",
            event: "alert.delivery_failed",
            ts: new Date().toISOString(),
            source: "web",
            alert_event: event,
            attempt: attempt + 1,
            error_message: message,
          }),
        );
      }
    }
  }
};

const emit = (level: LogLevel, event: string, fields: LogFields) => {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    source: "web",
    ...fields,
  };
  const line = JSON.stringify(payload);
  void sendAlert(level, event, fields);

  if (level === "error") {
    Sentry.captureEvent({
      message: event,
      level: "error",
      extra: fields,
      tags: {
        source: "web",
        event,
        ...(typeof fields.error_code === "string" ? { error_code: fields.error_code } : {}),
      },
    });
    console.error(line);
    return;
  }
  if (level === "warn") {
    Sentry.addBreadcrumb({ category: "logger", message: event, level: "warning", data: fields });
    console.warn(line);
    return;
  }
  Sentry.addBreadcrumb({ category: "logger", message: event, level: "info", data: fields });
  console.info(line);
};

export const logInfo = (event: string, fields: LogFields = {}) => emit("info", event, fields);
export const logWarn = (event: string, fields: LogFields = {}) => emit("warn", event, fields);
export const logError = (event: string, fields: LogFields = {}) => emit("error", event, fields);

export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

export const serializeError = (error: unknown): { message: string; name?: string } => {
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  return { message: String(error) };
};
