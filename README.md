# abl-gpt-proxy

Proxy API (REST) for ABL gRPC (`https://grpc.ablibrary.net`) to use with GPT Actions.

## Endpoints
- `GET /health`
- `GET /abl/books`
- `GET /abl/book/:id`
- `GET /abl/book/:id/toc`
- `GET /abl/book/:id/html`
- `GET /abl/search`
- `GET /abl/suggest`

## Local run
```bash
npm install
npm start
```

## Environment variables
- `PORT` (default `8080`)
- `API_KEY` (optional, if set requires `Authorization: Bearer <API_KEY>`)

## Fly.io
```bash
fly launch --no-deploy
fly secrets set API_KEY=your_strong_key
fly deploy
```
