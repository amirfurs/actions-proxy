# abl-gpt-proxy

Proxy API (REST) for ABL gRPC (`https://grpc.ablibrary.net`) to use with GPT Actions.

## Endpoints
- `GET /health`
- `GET /openapi.json`
- `GET /abl/books`
- `GET /abl/book/:id`
- `GET /abl/book/:id/toc`
- `GET /abl/book/:id/html`
- `GET /abl/search`
- `GET /abl/search/author`
- `GET /abl/suggest`
- `GET /abl/debug/index-backends` (debug)

### Notes
- `GET /abl/search` uses staged fallbacks: A) `SearchService.Search` (full), B) `SearchService.Search` (reduced), C) `BookService.List` fallback.
- Optional testing-only query: `forceStage=A|B|C` to force a stage.

## Local run
```bash
npm install
npm start
```

## Environment variables
- `PORT` (default `8080`)
- `API_KEY` (optional, if set requires `Authorization: Bearer <API_KEY>`)
- `ABL_GRPC_BASE_URL` (default `https://grpc.ablibrary.net`)
- `UPSTREAM_TIMEOUT_MS` (default `8000`)
- `UPSTREAM_RETRIES` (default `1`, max `2`)

## Fly.io
```bash
fly launch --no-deploy
fly secrets set API_KEY=your_strong_key
fly deploy
```
