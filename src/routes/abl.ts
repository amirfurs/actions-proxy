import express from "express";
import { toJson } from "@bufbuild/protobuf";

import { makeClients } from "../grpc.js";
import { getErrorClass, logEvent } from "../logging.js";
import { callWithRetry } from "../upstream.js";
import {
  readCsv,
  readLang,
  readPage,
  readPerPage,
  readQ,
  readType,
} from "../validation.js";
import { normalizeArabic, normalizeArabicKey } from "../arabic.js";

import {
  BookService,
  DetailsResponseSchema,
  HTMLContentsResponseSchema,
  ListRequest_Sort,
  ListResponseSchema,
  TableOfContentsResponseSchema,
} from "../../proto/ablibrary/services/book_service/book_service_pb.ts";
import {
  ListResponseSchema as ContributorListResponseSchema,
  ListRequest_ContributorSort,
} from "../../proto/ablibrary/services/contributor_service/contributor_service_pb.ts";
import {
  SearchRequest_Sort,
  SearchResponseSchema,
  SingleSuggestResponseSchema,
  SuggestionType,
} from "../../proto/ablibrary/services/search_service/search_service_pb.ts";
import { BackendLocation, SortDirection } from "../../proto/ablibrary/types/common_pb.ts";

function setLogMeta(res: any, upstream: string, stage?: string) {
  if (res?.locals?._log) {
    res.locals._log.upstream = upstream;
    if (stage) res.locals._log.stage = stage;
  }
}

function sendValidation(res: any, issues: any[]) {
  return res.status(400).json({ error: "Validation failed", issues });
}

function safeMessage(err: any) {
  const msg = String(err?.message || "Upstream request failed");
  return msg.length > 500 ? msg.slice(0, 500) : msg;
}

function scoreName(qNorm: string, name: string, freq: number) {
  const nNorm = normalizeArabic(name);
  const nKey = normalizeArabicKey(name);
  const qKey = qNorm.replace(/\s+/g, "");

  let match = 0;
  if (nNorm === qNorm || nKey === qKey) match = 300;
  else if (nNorm.startsWith(qNorm) || nKey.startsWith(qKey)) match = 200;
  else if (nNorm.includes(qNorm) || nKey.includes(qKey)) match = 100;
  return match + Math.min(50, Math.max(0, freq));
}

function dedupeByKey<T>(items: T[], getKey: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = getKey(it);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function isLikelyId(s: string) {
  const v = s.trim();
  if (!v) return false;
  if (v.length < 12) return false;
  return /^[0-9a-f-]+$/i.test(v);
}

export function ablRouter() {
  const r = express.Router();

  r.get("/books", async (req: any, res: any) => {
    const issues: any[] = [];
    const lang = readLang(req.query);
    const query = String(req.query.query || "").trim();
    const page = readPage(req.query, issues);
    const perPage = readPerPage(req.query, issues);
    if (issues.length) return sendValidation(res, issues);

    try {
      const { book } = makeClients(lang);
      setLogMeta(res, "BookService.List");
      const out = await callWithRetry((timeoutMs) =>
        book.list(
          {
            page,
            perPage,
            query,
            sortBy: ListRequest_Sort.UNSPECIFIED,
            sortDir: SortDirection.UNSPECIFIED,
            contributors: [],
            categories: [],
            publishers: [],
            tags: [],
            collections: [],
            languages: [],
            attachments: [],
            status: [],
            title: "",
            bookIds: [],
            sources: [],
          } as any,
          { timeoutMs }
        )
      );
      res.json(toJson(ListResponseSchema, out.out));
    } catch (e: any) {
      res.locals.errorClass = getErrorClass(e);
      res.status(502).json({ error: safeMessage(e) });
    }
  });

  r.get("/book/:id", async (req: any, res: any) => {
    const lang = readLang(req.query);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    try {
      const { book } = makeClients(lang);
      setLogMeta(res, "BookService.Details");
      const out = await callWithRetry((timeoutMs) => book.details({ id } as any, { timeoutMs }));
      res.json(toJson(DetailsResponseSchema, out.out));
    } catch (e: any) {
      res.locals.errorClass = getErrorClass(e);
      res.status(502).json({ error: safeMessage(e) });
    }
  });

  r.get("/book/:id/toc", async (req: any, res: any) => {
    const lang = readLang(req.query);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    try {
      const { book } = makeClients(lang);
      setLogMeta(res, "BookService.TableOfContents");
      const out = await callWithRetry((timeoutMs) => book.tableOfContents({ bookId: id } as any, { timeoutMs }));
      res.json(toJson(TableOfContentsResponseSchema, out.out));
    } catch (e: any) {
      res.locals.errorClass = getErrorClass(e);
      res.status(502).json({ error: safeMessage(e) });
    }
  });

  r.get("/book/:id/html", async (req: any, res: any) => {
    const lang = readLang(req.query);
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });

    const pageRaw = Number(req.query.page || "");
    const pageId = String(req.query.pageId || "").trim();
    const pageNumbers = Number.isFinite(pageRaw) ? [pageRaw] : [];
    const pageIds = pageId ? [pageId] : [];
    if (!pageNumbers.length && !pageIds.length) {
      return res.status(400).json({ error: "page or pageId is required" });
    }

    try {
      const { book } = makeClients(lang);
      setLogMeta(res, "BookService.HTMLContents");
      const out = await callWithRetry((timeoutMs) =>
        book.hTMLContents({ bookId: id, pageNumbers, pageIds } as any, { timeoutMs })
      );
      res.json(toJson(HTMLContentsResponseSchema, out.out));
    } catch (e: any) {
      res.locals.errorClass = getErrorClass(e);
      res.status(502).json({ error: safeMessage(e) });
    }
  });

  r.get("/search", async (req: any, res: any) => {
    const issues: any[] = [];
    const lang = readLang(req.query);
    const q = readQ(req.query, issues);
    const page = readPage(req.query, issues);
    const perPage = readPerPage(req.query, issues);
    if (issues.length) return sendValidation(res, issues);

    const author = String(req.query.author || req.query.contributor || "").trim();
    const title = String(req.query.title || "").trim();
    const publisher = String(req.query.publisher || "").trim();
    const languages = readCsv(req.query, "languages", 20);
    const categories = readCsv(req.query, "categories", 20);
    const collections = readCsv(req.query, "collections", 20);

    const forceStage = String(req.query.forceStage || "").trim().toUpperCase();
    const errors: any[] = [];
    const { search, book } = makeClients(lang);

    const normalizeOut = (payload: any, source: any) => {
      const books = Array.isArray(payload?.books) ? payload.books : [];
      const results = Array.isArray(payload?.results)
        ? payload.results
        : books.map((b: any) => ({ book: b }));
      const pagination = payload?.pagination || null;
      return {
        source,
        results,
        pagination,
        meta: { errors },
        // Convenience: flatten books for consumers that just want book objects
        books,
        raw: payload?.raw || undefined,
      };
    };

    const addStageError = (stage: string, upstream: string, err: any) => {
      errors.push({
        stage,
        upstream,
        errorClass: getErrorClass(err),
        message: safeMessage(err),
      });
    };

    // Stage A: SearchService.Search (full payload)
    if (forceStage !== "B" && forceStage !== "C") {
      try {
        setLogMeta(res, "SearchService.Search", "A");
        const backend = await callWithRetry((timeoutMs) => search.listIndexBackends({} as any, { timeoutMs }));
        const backends = backend.out?.backends || [];
        const preferred =
          backends.find((b: any) => Array.isArray(b?.supportedLocations) && b.supportedLocations.includes(BackendLocation.REMOTE)) ||
          backends[0];
        const indexBackendId = preferred?.id || "";

        const out = await callWithRetry((timeoutMs) =>
          search.search(
            {
              query: q,
              paginate: { page, perPage },
              sortBy: SearchRequest_Sort.RELEVANCE,
              sortDir: SortDirection.DESCENDING,
              backendLocation: BackendLocation.REMOTE,
              indexBackendId,
              books: title ? [title] : [],
              contributors: author ? [author] : [],
              diedAt: [],
              publishers: publisher ? [publisher] : [],
              languageIds: languages,
              categoryIds: categories,
              collectionIds: collections,
              sources: [],
              status: [],
              attachmentContexts: [],
              scope: [],
            } as any,
            { timeoutMs }
          )
        );

        const raw = toJson(SearchResponseSchema, out.out);
        const results = Array.isArray(raw?.results) ? raw.results : [];
        const books = results.map((r: any) => r?.book).filter(Boolean);
        return res.json(
          normalizeOut(
            {
              books,
              results,
              pagination: raw?.pagination || null,
              raw,
            },
            { stage: "A", upstream: "SearchService.Search" }
          )
        );
      } catch (e: any) {
        addStageError("A", "SearchService.Search", e);
      }
    }

    // Stage B: SearchService.Search (reduced payload)
    if (forceStage !== "A" && forceStage !== "C") {
      try {
        setLogMeta(res, "SearchService.Search", "B");
        const out = await callWithRetry((timeoutMs) =>
          search.search(
            {
              query: q,
              paginate: { page, perPage },
              sortBy: SearchRequest_Sort.UNSPECIFIED,
              sortDir: SortDirection.UNSPECIFIED,
              books: title ? [title] : [],
              contributors: author ? [author] : [],
              diedAt: [],
              publishers: publisher ? [publisher] : [],
              languageIds: languages,
              categoryIds: categories,
              collectionIds: collections,
              scope: [],
            } as any,
            { timeoutMs }
          )
        );

        const raw = toJson(SearchResponseSchema, out.out);
        const results = Array.isArray(raw?.results) ? raw.results : [];
        const books = results.map((r: any) => r?.book).filter(Boolean);
        return res.json(
          normalizeOut(
            {
              books,
              results,
              pagination: raw?.pagination || null,
              raw,
            },
            { stage: "B", upstream: "SearchService.Search" }
          )
        );
      } catch (e: any) {
        addStageError("B", "SearchService.Search", e);
      }
    }

    // Stage C: BookService.List fallback
    try {
      setLogMeta(res, "BookService.List", "C");
    const contributorFilters = author
        ? [
            isLikelyId(author)
              ? { id: author, name: "", role: "", died: undefined }
              : { id: "", name: author, role: "", died: undefined },
          ]
        : [];
      const publisherFilters = publisher ? [{ id: "", name: publisher }] : [];

      const out = await callWithRetry((timeoutMs) =>
        book.list(
          {
            page,
            perPage,
            query: q,
            sortBy: ListRequest_Sort.UNSPECIFIED,
            sortDir: SortDirection.UNSPECIFIED,
            contributors: contributorFilters,
            categories,
            publishers: publisherFilters,
            tags: [],
            collections,
            languages,
            attachments: [],
            status: [],
            title,
            bookIds: [],
            sources: [],
          } as any,
          { timeoutMs }
        )
      );
      const raw = toJson(ListResponseSchema, out.out);
      return res.json(
        normalizeOut(
          {
            books: raw?.books || [],
            results: (raw?.books || []).map((b: any) => ({ book: b })),
            pagination: raw?.pagination || null,
            raw,
          },
          { stage: "C", upstream: "BookService.List" }
        )
      );
    } catch (e: any) {
      addStageError("C", "BookService.List", e);
      res.locals.errorClass = getErrorClass(e);
      return res.status(502).json({
        error: "All search stages failed",
        meta: { errors },
      });
    }
  });

  r.get("/search/author", async (req: any, res: any) => {
    const issues: any[] = [];
    const lang = readLang(req.query);
    const q = readQ(req.query, issues);
    const page = readPage(req.query, issues);
    const perPage = readPerPage(req.query, issues);
    if (issues.length) return sendValidation(res, issues);

    const qNorm = normalizeArabic(q);
    const { contributor, search, book } = makeClients(lang);
    const stageErrors: any[] = [];

    const candidates: { id?: string; name: string; source: string }[] = [];
    const freq: Record<string, number> = Object.create(null);

    // Frequency signal from top book hits (best-effort)
    try {
      setLogMeta(res, "BookService.List", "freq");
      const out = await callWithRetry((timeoutMs) =>
        book.list(
          {
            page: 1,
            perPage: 50,
            query: q,
            sortBy: ListRequest_Sort.UNSPECIFIED,
            sortDir: SortDirection.UNSPECIFIED,
            contributors: [],
            categories: [],
            publishers: [],
            tags: [],
            collections: [],
            languages: [],
            attachments: [],
            status: [],
            title: "",
            bookIds: [],
            sources: [],
          } as any,
          { timeoutMs }
        )
      );
      const raw = toJson(ListResponseSchema, out.out);
      const books = Array.isArray(raw?.books) ? raw.books : [];
      for (const b of books) {
        const cs = Array.isArray(b?.contributors) ? b.contributors : [];
        for (const c of cs) {
          const name = String(c?.contributor?.name || c?.displayName || "").trim();
          if (!name) continue;
          const key = normalizeArabicKey(name);
          freq[key] = (freq[key] || 0) + 1;
        }
      }
    } catch (e: any) {
      stageErrors.push({ stage: "freq", upstream: "BookService.List", errorClass: getErrorClass(e), message: safeMessage(e) });
    }

    // Stage A: ContributorService.List
    try {
      setLogMeta(res, "ContributorService.List", "A");
      const out = await callWithRetry((timeoutMs) =>
        contributor.list(
          {
            page,
            perPage: Math.max(perPage, 20),
            query: q,
            sortBy: ListRequest_ContributorSort.NAME,
            sortDir: SortDirection.ASCENDING,
            books: [],
            publishers: [],
            tags: [],
          } as any,
          { timeoutMs }
        )
      );
      const raw = toJson(ContributorListResponseSchema, out.out);
      const items = Array.isArray(raw?.contributors) ? raw.contributors : [];
      for (const it of items) {
        const name = String(it?.name || "").trim();
        if (!name) continue;
        candidates.push({ id: String(it?.id || "").trim() || undefined, name, source: "ContributorService.List" });
        for (const alias of Array.isArray(it?.aliases) ? it.aliases : []) {
          const a = String(alias || "").trim();
          if (a) candidates.push({ id: String(it?.id || "").trim() || undefined, name: a, source: "ContributorService.List.alias" });
        }
      }
    } catch (e: any) {
      stageErrors.push({ stage: "A", upstream: "ContributorService.List", errorClass: getErrorClass(e), message: safeMessage(e) });
    }

    // Stage B: SearchService.SingleSuggest (contributors)
    try {
      setLogMeta(res, "SearchService.SingleSuggest", "B");
      const out = await callWithRetry((timeoutMs) =>
        search.singleSuggest(
          { query: q, paginate: { page: 1, perPage: 20 }, types: [SuggestionType.CONTRIBUTOR] } as any,
          { timeoutMs }
        )
      );
      const raw = toJson(SingleSuggestResponseSchema, out.out);
      const suggestions = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
      for (const group of suggestions) {
        if (group?.type !== "SUGGESTION_TYPE_CONTRIBUTOR" && group?.type !== SuggestionType.CONTRIBUTOR) continue;
        const items = Array.isArray(group?.items) ? group.items : [];
        for (const s of items) {
          const label = String(s?.label || "").trim();
          if (!label) continue;
          candidates.push({ id: String(s?.id || "").trim() || undefined, name: label, source: "SearchService.SingleSuggest" });
        }
      }
    } catch (e: any) {
      stageErrors.push({ stage: "B", upstream: "SearchService.SingleSuggest", errorClass: getErrorClass(e), message: safeMessage(e) });
    }

    // Stage C: BookService.List extraction fallback (best-effort)
    if (candidates.length === 0) {
      try {
        setLogMeta(res, "BookService.List", "C");
        const out = await callWithRetry((timeoutMs) =>
          book.list(
            {
              page: 1,
              perPage: 50,
              query: q,
              sortBy: ListRequest_Sort.UNSPECIFIED,
              sortDir: SortDirection.UNSPECIFIED,
              contributors: [],
              categories: [],
              publishers: [],
              tags: [],
              collections: [],
              languages: [],
              attachments: [],
              status: [],
              title: "",
              bookIds: [],
              sources: [],
            } as any,
            { timeoutMs }
          )
        );
        const raw = toJson(ListResponseSchema, out.out);
        const books = Array.isArray(raw?.books) ? raw.books : [];
        for (const b of books) {
          for (const c of Array.isArray(b?.contributors) ? b.contributors : []) {
            const name = String(c?.contributor?.name || c?.displayName || "").trim();
            if (name) candidates.push({ name, source: "BookService.List.extract" });
          }
        }
      } catch (e: any) {
        stageErrors.push({ stage: "C", upstream: "BookService.List", errorClass: getErrorClass(e), message: safeMessage(e) });
      }
    }

    const deduped = dedupeByKey(candidates, (c) => normalizeArabicKey(c.name));
    const ranked = deduped
      .map((c) => {
        const key = normalizeArabicKey(c.name);
        const f = freq[key] || 0;
        const score = scoreName(qNorm, c.name, f);
        return { id: c.id, name: c.name, score, freq: f, source: c.source };
      })
      .filter((c) => scoreName(qNorm, c.name, 0) > 0 || normalizeArabic(c.name).includes(qNorm))
      .sort((a, b) => (b.score - a.score) || (b.freq - a.freq) || a.name.localeCompare(b.name, "ar"));

    // Only return requested perPage, but keep stable ordering.
    const items = ranked.slice(0, perPage);

    res.json({
      query: q,
      items,
      meta: {
        normalizedQuery: qNorm,
        deduped: true,
        errors: stageErrors,
      },
    });
  });

  r.get("/suggest", async (req: any, res: any) => {
    const issues: any[] = [];
    const lang = readLang(req.query);
    const q = readQ(req.query, issues);
    const type = readType(req.query, ["author", "title"], issues);
    if (issues.length) return sendValidation(res, issues);

    const qNorm = normalizeArabic(q);
    const { search, contributor, book } = makeClients(lang);
    const stageErrors: any[] = [];

    const detailed: { id?: string; label: string; source: string }[] = [];
    const freq: Record<string, number> = Object.create(null);

    // Frequency from BookService.List (best-effort)
    try {
      setLogMeta(res, "BookService.List", "freq");
    const out = await callWithRetry((timeoutMs) =>
        book.list(
          {
            page: 1,
            perPage: 50,
            query: q,
            sortBy: ListRequest_Sort.UNSPECIFIED,
            sortDir: SortDirection.UNSPECIFIED,
            contributors: [],
            categories: [],
            publishers: [],
            tags: [],
            collections: [],
            languages: [],
            attachments: [],
            status: [],
            title: "",
            bookIds: [],
            sources: [],
          } as any,
          { timeoutMs }
        )
      );
      const raw = toJson(ListResponseSchema, out.out);
      const books = Array.isArray(raw?.books) ? raw.books : [];
      for (const b of books) {
        if (type === "title") {
          const t = String(b?.title || "").trim();
          if (!t) continue;
          const key = normalizeArabicKey(t);
          freq[key] = (freq[key] || 0) + 1;
        } else {
          for (const c of Array.isArray(b?.contributors) ? b.contributors : []) {
            const name = String(c?.contributor?.name || c?.displayName || "").trim();
            if (!name) continue;
            const key = normalizeArabicKey(name);
            freq[key] = (freq[key] || 0) + 1;
          }
        }
      }
    } catch (e: any) {
      stageErrors.push({ stage: "freq", upstream: "BookService.List", errorClass: getErrorClass(e), message: safeMessage(e) });
    }

    // Stage A: SearchService.SingleSuggest
    try {
      setLogMeta(res, "SearchService.SingleSuggest", "A");
      const types = type === "title" ? [SuggestionType.BOOK] : [SuggestionType.CONTRIBUTOR];
      const out = await callWithRetry((timeoutMs) =>
        search.singleSuggest({ query: q, paginate: { page: 1, perPage: 20 }, types } as any, { timeoutMs })
      );
      const raw = toJson(SingleSuggestResponseSchema, out.out);
      const groups = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
      for (const g of groups) {
        const items = Array.isArray(g?.items) ? g.items : [];
        for (const s of items) {
          const label = String(s?.label || "").trim();
          if (!label) continue;
          detailed.push({ id: String(s?.id || "").trim() || undefined, label, source: "SearchService.SingleSuggest" });
        }
      }
    } catch (e: any) {
      stageErrors.push({ stage: "A", upstream: "SearchService.SingleSuggest", errorClass: getErrorClass(e), message: safeMessage(e) });
    }

    // Stage B: ContributorService.List (for authors)
    if (type === "author") {
      try {
        setLogMeta(res, "ContributorService.List", "B");
        const out = await callWithRetry((timeoutMs) =>
          contributor.list(
            { page: 1, perPage: 20, query: q, sortBy: ListRequest_ContributorSort.NAME, sortDir: SortDirection.ASCENDING, books: [], publishers: [], tags: [] } as any,
            { timeoutMs }
          )
        );
        const raw = toJson(ContributorListResponseSchema, out.out);
        const items = Array.isArray(raw?.contributors) ? raw.contributors : [];
        for (const it of items) {
          const name = String(it?.name || "").trim();
          if (name) detailed.push({ id: String(it?.id || "").trim() || undefined, label: name, source: "ContributorService.List" });
        }
      } catch (e: any) {
        stageErrors.push({ stage: "B", upstream: "ContributorService.List", errorClass: getErrorClass(e), message: safeMessage(e) });
      }
    }

    // Stage C: BookService.List extraction fallback (avoid false-empty)
    if (detailed.length === 0) {
      try {
        setLogMeta(res, "BookService.List", "C");
        const out = await callWithRetry((timeoutMs) =>
          book.list(
            {
              page: 1,
              perPage: 50,
              query: q,
              sortBy: ListRequest_Sort.UNSPECIFIED,
              sortDir: SortDirection.UNSPECIFIED,
              contributors: [],
              categories: [],
              publishers: [],
              tags: [],
              collections: [],
              languages: [],
              attachments: [],
              status: [],
              title: "",
              bookIds: [],
              sources: [],
            } as any,
            { timeoutMs }
          )
        );
        const raw = toJson(ListResponseSchema, out.out);
        const books = Array.isArray(raw?.books) ? raw.books : [];
        if (type === "title") {
          for (const b of books) {
            const t = String(b?.title || "").trim();
            if (t) detailed.push({ label: t, source: "BookService.List.extract" });
          }
        } else {
          for (const b of books) {
            for (const c of Array.isArray(b?.contributors) ? b.contributors : []) {
              const name = String(c?.contributor?.name || c?.displayName || "").trim();
              if (name) detailed.push({ label: name, source: "BookService.List.extract" });
            }
          }
        }
      } catch (e: any) {
        stageErrors.push({ stage: "C", upstream: "BookService.List", errorClass: getErrorClass(e), message: safeMessage(e) });
      }
    }

    // Dedupe + rank + stable order
    const deduped = dedupeByKey(detailed, (d) => normalizeArabicKey(d.label));
    const ranked = deduped
      .map((d) => {
        const key = normalizeArabicKey(d.label);
        const f = freq[key] || 0;
        const score = scoreName(qNorm, d.label, f);
        return { ...d, score, freq: f };
      })
      .sort((a, b) => (b.score - a.score) || (b.freq - a.freq) || a.label.localeCompare(b.label, "ar"));

    const top = ranked.slice(0, 10);
    const items = top.map((t) => t.label);

    res.json({
      items,
      itemsDetailed: top.map((t) => ({ id: t.id, label: t.label, source: t.source })),
      meta: {
        type,
        normalizedQuery: qNorm,
        errors: stageErrors,
      },
    });
  });

  // Helpful for diagnosing upstream failures (no secrets)
  r.get("/debug/index-backends", async (req: any, res: any) => {
    const lang = readLang(req.query);
    try {
      const { search } = makeClients(lang);
      setLogMeta(res, "SearchService.ListIndexBackends");
      const out = await callWithRetry((timeoutMs) => search.listIndexBackends({} as any, { timeoutMs }));
      res.json(out.out);
    } catch (e: any) {
      res.locals.errorClass = getErrorClass(e);
      res.status(502).json({ error: safeMessage(e) });
    }
  });

  // Minimal log for any 404 under /abl
  r.use((_req, res) => {
    logEvent("warn", { endpoint: "/abl/*", status: 404, message: "Not found" });
    res.status(404).json({ error: "Not found" });
  });

  return r;
}
