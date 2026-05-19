export function buildOpenApiSpec(baseUrl = "") {
  const serverUrl = baseUrl || "http://localhost:8080";
  return {
    openapi: "3.1.0",
    info: {
      title: "ABL GPT Proxy",
      version: "1.1.0",
      description:
        "REST proxy for ABL Library gRPC backend (https://grpc.ablibrary.net), designed for GPT Actions. Endpoints are backward-compatible; /abl/search uses multi-stage fallback.",
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          responses: {
            "200": {
              description: "OK",
              content: { "application/json": { example: { ok: true } } },
            },
          },
        },
      },
      "/openapi.json": {
        get: {
          summary: "OpenAPI spec",
          responses: { "200": { description: "OpenAPI JSON" } },
        },
      },
      "/abl/books": {
        get: {
          summary: "List books (BookService.List)",
          parameters: [
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
            { name: "query", in: "query", schema: { type: "string", default: "" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          ],
          responses: { "200": { description: "List response" } },
        },
      },
      "/abl/book/{id}": {
        get: {
          summary: "Book details (BookService.Details)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
          ],
          responses: { "200": { description: "Details response" } },
        },
      },
      "/abl/book/{id}/toc": {
        get: {
          summary: "Book table of contents (BookService.TableOfContents)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
          ],
          responses: { "200": { description: "TOC response" } },
        },
      },
      "/abl/book/{id}/html": {
        get: {
          summary: "Book HTML contents (BookService.HTMLContents)",
          parameters: [
            { name: "id", in: "path", required: true, schema: { type: "string" } },
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "pageId", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "HTML contents response" } },
        },
      },
      "/abl/search": {
        get: {
          summary: "Global search with fallbacks",
          description:
            "Stages: A) SearchService.Search (full payload + index backend selection), B) SearchService.Search (reduced payload), C) BookService.List (fallback). Response includes `source` and `meta.errors` when stages fail.",
          parameters: [
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
            { name: "author", in: "query", schema: { type: "string" }, description: "Contributor filter (name or id)." },
            { name: "title", in: "query", schema: { type: "string" }, description: "Book title filter." },
            { name: "publisher", in: "query", schema: { type: "string" }, description: "Publisher name filter." },
            { name: "languages", in: "query", schema: { type: "string" }, description: "Comma-separated language ids." },
            { name: "categories", in: "query", schema: { type: "string" }, description: "Comma-separated category ids." },
            { name: "collections", in: "query", schema: { type: "string" }, description: "Comma-separated collection ids." },
            { name: "forceStage", in: "query", schema: { type: "string", enum: ["A", "B", "C"] }, description: "Testing only: force a fallback stage." },
          ],
          responses: {
            "200": {
              description: "Normalized search response",
              content: {
                "application/json": {
                  example: {
                    source: { stage: "A", upstream: "SearchService.Search" },
                    books: [],
                    results: [],
                    pagination: { currentPage: 1, perPage: 20, totalPages: 0, totalItems: 0, currentPageItems: 0 },
                    meta: { errors: [] },
                  },
                },
              },
            },
          },
        },
      },
      "/abl/search/author": {
        get: {
          summary: "Author discovery (ContributorService.List + merged sources)",
          parameters: [
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
            { name: "perPage", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 20 } },
          ],
          responses: {
            "200": {
              description: "Ranked authors",
              content: {
                "application/json": {
                  example: {
                    query: "ابن",
                    items: [{ id: "123", name: "ابن سينا", score: 210, freq: 12 }],
                    meta: { deduped: true },
                  },
                },
              },
            },
          },
        },
      },
      "/abl/suggest": {
        get: {
          summary: "Suggestions (authors/titles) with strong dedupe",
          parameters: [
            { name: "lang", in: "query", schema: { type: "string", default: "ar" } },
            { name: "type", in: "query", schema: { type: "string", enum: ["author", "title"], default: "author" } },
            { name: "q", in: "query", required: true, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Suggestions",
              content: {
                "application/json": {
                  example: { items: ["ابن سينا", "ابن تيمية"], itemsDetailed: [{ id: "123", label: "ابن سينا" }] },
                },
              },
            },
          },
        },
      },
      "/abl/debug/index-backends": {
        get: {
          summary: "List search index backends (debug)",
          description:
            "Calls SearchService.ListIndexBackends. Useful for diagnosing upstream search availability. Does not require query input.",
          parameters: [{ name: "lang", in: "query", schema: { type: "string", default: "ar" } }],
          responses: { "200": { description: "Index backends response" } },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
  };
}
