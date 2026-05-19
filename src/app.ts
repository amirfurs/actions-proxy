import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { API_KEY } from "./config.js";
import { logEvent } from "./logging.js";
import { buildOpenApiSpec } from "./openapi.js";
import { ablRouter } from "./routes/abl.js";

dotenv.config();

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // Auth (optional)
  app.use((req: any, res: any, next: any) => {
    if (!API_KEY) return next();
    const h = req.headers.authorization || "";
    if (h === `Bearer ${API_KEY}`) return next();
    return res.status(401).json({ error: "Unauthorized" });
  });

  // Structured request log
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    res.locals._log = {
      endpoint: req.path,
      method: req.method,
      upstream: undefined as string | undefined,
      stage: undefined as string | undefined,
    };
    res.on("finish", () => {
      const latencyMs = Date.now() - start;
      const meta = res.locals?._log || {};
      logEvent("info", {
        endpoint: meta.endpoint || req.path,
        method: meta.method || req.method,
        status: res.statusCode,
        latency_ms: latencyMs,
        upstream_method: meta.upstream,
        fallback_stage: meta.stage,
        error_class: res.locals?.errorClass,
      });
    });
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/openapi.json", (req, res) => {
    const base = `${req.protocol}://${req.get("host")}`;
    res.json(buildOpenApiSpec(base));
  });

  app.use("/abl", ablRouter());

  // Final safety net
  app.use((err: any, _req: any, res: any, _next: any) => {
    res.locals.errorClass = err?.name || "UnhandledError";
    res.status(500).json({ error: "Unhandled error" });
  });

  return app;
}

