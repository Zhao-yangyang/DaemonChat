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

const sendAlert = async (level: LogLevel, event: string, fields: LogFields) => {
  if (!alertWebhookUrl) return;
  if (alertLevelRank[level] < alertLevelRank[alertMinLevel]) return;
  try {
    await fetch(alertWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "web",
        level,
        event,
        ts: new Date().toISOString(),
        ...fields,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        level: "error",
        event: "alert.delivery_failed",
        ts: new Date().toISOString(),
        source: "web",
        error_message: message,
      })
    );
  }
};

const emit = (level: LogLevel, event: string, fields: LogFields) => {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  };
  const line = JSON.stringify(payload);
  void sendAlert(level, event, fields);
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
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
