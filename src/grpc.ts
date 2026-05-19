import { createClient } from "@connectrpc/connect";
import { createGrpcTransport } from "@connectrpc/connect-node";

import { BASE_URL } from "./config.js";

import { BookService } from "../proto/ablibrary/services/book_service/book_service_pb.ts";
import { SearchService } from "../proto/ablibrary/services/search_service/search_service_pb.ts";
import { ContributorService } from "../proto/ablibrary/services/contributor_service/contributor_service_pb.ts";

const addLanguageInterceptor =
  (language: string) =>
  (next: any) =>
  async (req: any) => {
    req.header.set("x-language-id", language || "ar");
    return await next(req);
  };

export function makeClients(lang = "ar") {
  const transport = createGrpcTransport({
    baseUrl: BASE_URL,
    interceptors: [addLanguageInterceptor(lang)],
    nodeOptions: { rejectUnauthorized: false, requestCert: false },
  });

  return {
    book: createClient(BookService, transport),
    search: createClient(SearchService, transport),
    contributor: createClient(ContributorService, transport),
  };
}

