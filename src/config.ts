export const PORT = Number(process.env.PORT || 8080);
export const API_KEY = process.env.API_KEY || "";
export const BASE_URL = process.env.ABL_GRPC_BASE_URL || "https://grpc.ablibrary.net";

export const DEFAULT_LANG = "ar";

export const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);
export const UPSTREAM_RETRIES = Math.max(0, Math.min(2, Number(process.env.UPSTREAM_RETRIES || 1)));

export const MAX_Q_LEN = 200;
export const MAX_PAGE = 10_000;
export const MAX_PER_PAGE = 50;
