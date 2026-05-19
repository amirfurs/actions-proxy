import { DEFAULT_LANG, MAX_PAGE, MAX_PER_PAGE, MAX_Q_LEN } from "./config.js";

export type ValidationIssue = { field: string; message: string };

function toInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v !== "string") return undefined;
  if (!v.trim()) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

export function readLang(q: any) {
  const lang = String(q?.lang || DEFAULT_LANG).trim();
  // Allow any non-empty language id; ABL uses x-language-id values like "ar".
  return lang || DEFAULT_LANG;
}

export function readPage(q: any, issues: ValidationIssue[]) {
  const raw = toInt(q?.page);
  const page = raw ?? 1;
  if (page < 1) issues.push({ field: "page", message: "must be >= 1" });
  if (page > MAX_PAGE) issues.push({ field: "page", message: `must be <= ${MAX_PAGE}` });
  return Math.min(MAX_PAGE, Math.max(1, page));
}

export function readPerPage(q: any, issues: ValidationIssue[]) {
  const raw = toInt(q?.perPage);
  const perPage = raw ?? 20;
  if (perPage < 1) issues.push({ field: "perPage", message: "must be >= 1" });
  if (perPage > MAX_PER_PAGE) issues.push({ field: "perPage", message: `must be <= ${MAX_PER_PAGE}` });
  return Math.min(MAX_PER_PAGE, Math.max(1, perPage));
}

export function readQ(q: any, issues: ValidationIssue[]) {
  const v = String(q?.q ?? "").trim();
  if (!v) issues.push({ field: "q", message: "is required" });
  if (v.length > MAX_Q_LEN) issues.push({ field: "q", message: `must be <= ${MAX_Q_LEN} chars` });
  return v.slice(0, MAX_Q_LEN);
}

export function readType(q: any, allowed: string[], issues: ValidationIssue[]) {
  const t = String(q?.type ?? "").trim();
  if (!t) return allowed[0];
  if (!allowed.includes(t)) issues.push({ field: "type", message: `must be one of: ${allowed.join(", ")}` });
  return allowed.includes(t) ? t : allowed[0];
}

export function readCsv(q: any, key: string, maxItems = 20) {
  const raw = String(q?.[key] ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}
