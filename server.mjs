import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient, Interceptor } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";
import { toJson } from "@bufbuild/protobuf";

import {
  BookService,
  DetailsResponseSchema,
  HTMLContentsResponseSchema,
  ListResponseSchema,
  TableOfContentsResponseSchema,
} from "./proto/ablibrary/services/book_service/book_service_pb.js";
import { SearchService } from "./proto/ablibrary/services/search_service/search_service_pb.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 8080);
const API_KEY = process.env.API_KEY || "";
const BASE_URL = "https://grpc.ablibrary.net";

function auth(req, res, next) {
  if (!API_KEY) return next();
  const h = req.headers.authorization || "";
  if (h === `Bearer ${API_KEY}`) return next();
  return res.status(401).json({ error: "Unauthorized" });
}
app.use(auth);

const addLanguageInterceptor = (language) =>
  ((next) => async (req) => {
    req.header.set("x-language-id", language || "ar");
    return await next(req);
  });

function makeClients(lang = "ar") {
  const transport = createGrpcTransport({
    baseUrl: BASE_URL,
    interceptors: [addLanguageInterceptor(lang)],
    nodeOptions: { rejectUnauthorized: false, requestCert: false },
  });

  return {
    book: createClient(BookService, transport),
    search: createClient(SearchService, transport),
  };
}

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/abl/books", async (req, res) => {
  try {
    const lang = String(req.query.lang || "ar");
    const query = String(req.query.query || "");
    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(50, Math.max(1, Number(req.query.perPage || 20)));

    const { book } = makeClients(lang);
    const out = await book.list({ query, pagination: { page, perPage } });
    res.json(toJson(ListResponseSchema, out));
  } catch (e) {
    res.status(502).json({ error: e?.message ?? "ABL request failed" });
  }
});

app.get("/abl/book/:id", async (req, res) => {
  try {
    const lang = String(req.query.lang || "ar");
    const { id } = req.params;
    const { book } = makeClients(lang);
    const out = await book.details({ id });
    res.json(toJson(DetailsResponseSchema, out));
  } catch (e) {
    res.status(502).json({ error: e?.message ?? "ABL request failed" });
  }
});

app.get("/abl/book/:id/toc", async (req, res) => {
  try {
    const lang = String(req.query.lang || "ar");
    const { id } = req.params;
    const { book } = makeClients(lang);
    const out = await book.tableOfContents({ bookId: id });
    res.json(toJson(TableOfContentsResponseSchema, out));
  } catch (e) {
    res.status(502).json({ error: e?.message ?? "ABL request failed" });
  }
});

app.get("/abl/book/:id/html", async (req, res) => {
  try {
    const lang = String(req.query.lang || "ar");
    const { id } = req.params;
    const page = Number(req.query.page || "");
    const pageId = String(req.query.pageId || "").trim();

    const { book } = makeClients(lang);
    const out = await book.hTMLContents({
      bookId: id,
      pageNumbers: Number.isFinite(page) ? [page] : [],
      pageIds: pageId ? [pageId] : [],
    });
    res.json(toJson(HTMLContentsResponseSchema, out));
  } catch (e) {
    res.status(502).json({ error: e?.message ?? "ABL request failed" });
  }
});

app.get("/abl/search", async (req, res) => {
  try {
    const lang = String(req.query.lang || "ar");
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });

    const page = Math.max(1, Number(req.query.page || 1));
    const perPage = Math.min(50, Math.max(1, Number(req.query.perPage || 20)));
    const { search } = makeClients(lang);

    const idx = await search.listIndexBackends({});
    const backendId = idx?.indexes?.[0]?.backendId || "";

    const out = await search.search({
      backendId,
      query: q,
      pagination: { page, perPage },
    });

    res.json(out);
  } catch (e) {
    res.status(502).json({ error: e?.message ?? "ABL request failed" });
  }
});

app.get("/abl/suggest", async (req, res) => {
  try {
    const lang = String(req.query.lang || "ar");
    const type = String(req.query.type || "author");
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q is required" });

    const { book } = makeClients(lang);
    const out = await book.list({ query: q, pagination: { page: 1, perPage: 10 } });
    const items = out?.books || [];

    if (type === "author") {
      const authors = [...new Set(items.flatMap((b) => (b.contributors || []).map((c) => c?.name).filter(Boolean)))];
      return res.json({ items: authors.slice(0, 10) });
    }

    const titles = [...new Set(items.map((b) => b?.title).filter(Boolean))];
    return res.json({ items: titles.slice(0, 10) });
  } catch (e) {
    res.status(502).json({ error: e?.message ?? "ABL request failed" });
  }
});

app.listen(PORT, () => {
  console.log(`ABL proxy listening on :${PORT}`);
});