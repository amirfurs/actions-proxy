import { UPSTREAM_RETRIES, UPSTREAM_TIMEOUT_MS } from "./config.js";

export type UpstreamAttempt = {
  ok: boolean;
  stage: string;
  upstream: string;
  message?: string;
  errorClass?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function callWithRetry<T>(fn: (timeoutMs: number) => Promise<T>) {
  const attempts: { error: any }[] = [];
  const max = 1 + UPSTREAM_RETRIES;
  for (let i = 0; i < max; i++) {
    try {
      const timeout = UPSTREAM_TIMEOUT_MS;
      const out = await fn(timeout);
      return { ok: true as const, out, attempts };
    } catch (e: any) {
      attempts.push({ error: e });
      const msg = String(e?.message || "").toLowerCase();
      const retryable =
        msg.includes("unavailable") ||
        msg.includes("deadline") ||
        msg.includes("timeout") ||
        msg.includes("fetch failed") ||
        msg.includes("econnreset") ||
        msg.includes("socket");
      if (!retryable || i === max - 1) break;
      await sleep(150 * (i + 1));
    }
  }
  const last = attempts[attempts.length - 1]?.error;
  throw last;
}

