# Agentic Dev Environment

A Docker sandbox for developing and refactoring fit-gen-v2 with Antigravity. The container has no
direct internet access; everything outbound goes through a tinyproxy sidecar with
an allowlist.

## Prerequisites

- Docker Desktop (running)
- `.env` at the repo root (gitignored) with your `VITE_*`, Firebase, and Groq values
- Server-side AI settings for the Vercel functions: `PROVIDER_API_KEY` (your Groq
  key), `API_URL=https://api.groq.com/openai/v1/chat/completions`, `MODEL`, and
  `MODEL_FALLBACK_1` / `MODEL_FALLBACK_2`. These are read by `api/callModel.js`
  and `api/debug.js`, not by the Vite client.

## First run

```bash
docker compose down -v      # drops stale volumes, including old node_modules
docker compose build
docker compose up -d
docker compose exec dev bash
```

`node_modules` is seeded from the image into a named volume on first start. After a
change to `package.json` or `package-lock.json`, refresh the volume:

```bash
docker compose exec dev npm install
```

## Running the Interactive Antigravity CLI

Inside the container:

```bash
docker compose exec dev agy
```

Or attach a bash terminal first:
```bash
docker compose exec dev bash
agy
```

On first launch, follow the one-time Google OAuth browser link to authenticate your Google AI Pro account. Your session token will be saved inside the isolated `antigravity-config` volume.

## Running the app

Inside the container:

```bash
npm run dev -- --host 0.0.0.0
```

Open http://localhost:5173 on the host. Note that `.env` sets
`VITE_BACKEND_URL` to `http://localhost:3000/api/callModel`, so the AI feature
only works if you either run the functions locally (`vercel dev`, requires
publishing port 3000) or point that variable at your deployed API.

If HMR stops working on a Windows bind mount, restart with `CHOKIDAR_USEPOLLING=1`.

## Network policy

- `dev` sits on an internal network with no route out.
- All egress goes through `proxy:8888` (via `HTTP_PROXY` / `HTTPS_PROXY`, plus
  `NODE_USE_ENV_PROXY=1` so Node's `fetch` honors them too).
- Only hosts matched in `filter` are reachable. To add one:

  ```bash
  # add a line like (^|\.)example\.com$ to ./filter
  docker compose restart proxy
  ```

- `ConnectPort 443` means **HTTPS only**: no `git` over SSH, no port 22. Use
  HTTPS remotes.
- Allowlisted AI hosts: `api.groq.com` (app), Google APIs / Gemini (agent), and
  `googleapis.com` (Firebase token checks).
- CONNECT is allowed only for the pinned `10.201.0.0/24` subnet; changing that
  subnet means changing `Allow` in `tinyproxy.conf` in the same commit.

## Working with the agent

- One task per session; ask for a plan before a large refactor.
- Commit (or branch) before starting, so `git diff` is the review surface.
- `git status` should be clean after a checkout - the image sets `safe.directory`
  and `core.autocrlf=input` to prevent phantom line-ending diffs.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm install` hangs | Host missing from `filter` | Add it, `docker compose restart proxy` |
| Proxy restarts in a loop | Config parse error | `docker compose logs proxy` names the line |
| All requests get 403 | Subnet pinned but `Allow` not updated | Match the two values |
| Whole repo shows as modified | CRLF vs index | Keep `core.autocrlf=input` |
| New deps not installing | Stale `node_modules` volume | `docker compose down -v` |
| Agent can't reach provider | Client ignoring proxy env | Check `docker compose logs proxy` for refusals |
| AI calls return 401 / 500 | `PROVIDER_API_KEY` or `API_URL` missing | Set them for the functions, not just `VITE_*` |
| No live reload | Windows file watching | `CHOKIDAR_USEPOLLING=1` |

## Tear down

```bash
docker compose down        # keep volumes (fast restart)
docker compose down -v     # also drop node_modules and agent config
```
