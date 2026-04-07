# Deployment guide

This stack is **API + MongoDB + optional Redis + optional Gemini**. Never commit API keys; use each platform’s secret manager.

## Frontend — Vercel

1. Import the **GitHub repo** and set the **root directory** to `frontend`.
2. **Environment variables**
   - `NEXT_PUBLIC_API_URL` — public URL of your backend, e.g. `https://your-api.railway.app` (no trailing slash).
3. **Build**
   - Install command: `npm ci` (or `npm install --ignore-scripts` if your path has issues on Windows CI; Linux builders are usually fine).
   - Build: `npm run build`
   - Output: Next.js default (no need for Docker on Vercel).
4. After deploy, open the Vercel URL and confirm the home page loads and can reach the API (browser network tab).

## Backend — Railway or Render

### Railway

1. **New service** from GitHub; root directory **`backend`**.
2. **Start command**: `node dist/main.js`
3. **Build command**: `npm ci && npm run build` (postinstall downloads Tree-sitter WASM).
4. **Variables** (examples)
   - `MONGODB_URI` — Atlas or Railway Mongo plugin
   - `PORT` — Railway sets automatically; app reads `PORT`
   - `GEMINI_API_KEY` — optional; from Google AI Studio
   - `REDIS_URL` — optional; Upstash **TLS** URL for BullMQ
   - `WORKER_EMBEDDED=true` — run worker inside the same web process (simplest)
   - `NODE_ENV=production`
   - `LOG_LEVEL=info`
5. **Health**: configure health check path `/health` if the platform supports it.

### Render

1. **Web service**, root **`backend`**, environment **Node**.
2. **Build**: `npm ci && npm run build`
3. **Start**: `node dist/main.js`
4. Same env vars as Railway.
5. Install **Git** on the image if you use GitHub clone ingestion (`apt` in a `render.yaml` or custom Dockerfile). The provided `backend/Dockerfile` already installs `git`.

## Redis — Upstash or Redis Cloud

- Create a database and copy the **rediss://** or **redis://** URL.
- Set `REDIS_URL` on the backend. Upstash uses TLS; ioredis generally accepts `rediss://` URLs.
- If you **omit** `REDIS_URL`, analysis runs **synchronously** in the API process (no queue, no Redis cache for Gemini).

## MongoDB Atlas

1. Create a cluster and database user.
2. Network access: allow **0.0.0.0/0** for serverless hosts, or the provider’s egress IPs.
3. Connection string as `MONGODB_URI`.

## Docker (full stack on one machine)

1. `cp .env.docker.example .env.docker` and set `MONGODB_URI` (and optionally `GEMINI_API_KEY`).
2. `docker compose up --build`
3. UI: http://localhost:3000 — API: http://localhost:4000

## Checklist after deploy

- [ ] `GET /health` returns 200
- [ ] `GET /ready` returns 200 when Mongo is reachable
- [ ] Upload ZIP or GitHub ingest succeeds
- [ ] Analyze completes (queue or sync) and dashboard loads graph + AI panels when Gemini is configured
