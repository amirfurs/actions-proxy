type LogLevel = "info" | "warn" | "error";

export function logEvent(level: LogLevel, event: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    ...event,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function getErrorClass(err: unknown): string {
  if (!err) return "UnknownError";
  if (err instanceof Error) return err.name || "Error";
  const t = typeof err;
  return t === "object" ? "ObjectError" : `${t}Error`;
}
