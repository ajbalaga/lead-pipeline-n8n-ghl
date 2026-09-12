# BrightFix Lead Pipeline

A lead-capture web app for a fictional home-services business, wired end to
end into GoHighLevel through n8n — built as a portfolio project to
demonstrate the exact stack in the "AI Developer + AI Automations Engineer"
role: Claude Code as the primary dev tool, a self-managed Linux VPS, n8n
workflows, GHL automations, and an MCP server for AI-agent access to the
same data.

## Why this project

Most portfolio demos show a web app *or* an automation, not both connected.
This one is built so the pieces genuinely depend on each other: a real form
submission flows through a real webhook into a real n8n workflow into a real
GHL account and back again. Nothing here is mocked.

## Architecture

```
┌─────────────┐   POST /api/leads    ┌──────────────┐
│   Browser   │ ───────────────────▶ │  Next.js app │
│ (lead form) │                      │  (Node 20)   │
└─────────────┘                      └──────┬───────┘
                                             │ INSERT
                                             ▼
                                      ┌──────────────┐
                                      │  PostgreSQL  │
                                      └──────────────┘
                                             │
                              fire-and-forget webhook
                                             ▼
                                      ┌──────────────┐
                                      │     n8n      │
                                      │ "Lead Intake"│
                                      └──────┬───────┘
                                             │ upsert contact + tag
                                             ▼
                                      ┌──────────────┐
                                      │     GHL      │
                                      │  (Automation │
                                      │  triggers on │
                                      │   the tag)   │
                                      └──────┬───────┘
                                             │ workflow "Webhook" action
                                             ▼
                                      ┌──────────────┐
                                      │     n8n      │
                                      │"GHL Callback"│
                                      └──────┬───────┘
                                             │ POST /api/leads/status
                                             ▼
                                      ┌──────────────┐
                                      │  Next.js app │──▶ PostgreSQL (status updated)
                                      └──────────────┘

Everything above the "GHL" box runs in Docker Compose on one Linux VPS,
behind Caddy for automatic HTTPS.

┌──────────────┐   stdio    ┌──────────────┐
│ Claude Code /│ ◀────────▶ │  MCP server  │──▶ same PostgreSQL (read-only queries)
│Claude Desktop│            │ (2 tools)    │
└──────────────┘            └──────────────┘
```

## Stack, and why

| Piece | Choice | Why |
|---|---|---|
| Frontend + API | Next.js 14 (App Router), TypeScript | One deployable unit for both the form and the `/api/leads` endpoint; API routes avoid standing up a separate backend service for a form this simple. |
| Database | PostgreSQL | The lead record is relational and small; Postgres is the safe, boring, well-understood default and matches what most GHL/n8n-adjacent roles ask for. |
| Deployment | Docker Compose on a self-managed VPS | The JD explicitly asks for VPS ownership, not a managed platform (Render/Vercel/etc.) — this is the one thing those platforms can't demonstrate. |
| Reverse proxy | Caddy | Automatic Let's Encrypt HTTPS with a 6-line config, so the VPS setup time goes into the app and workflows, not certbot renewal cron jobs. |
| Automation | n8n (self-hosted) | Two workflows, not one — see below — to show n8n driving both directions of the integration, not just one webhook. |
| CRM automation | GoHighLevel | Native GHL Workflow (tag-triggered) handles the welcome sequence; n8n's job is the plumbing between the website and GHL, not replacing GHL's own automation builder. |
| Agent access | Custom MCP server | Exposes the same lead data to Claude Code/Desktop as two read tools, so an AI agent can answer "how many leads came in today" without needing dashboard access. |

## Payload reference

**Browser → App** — `POST /api/leads`
```json
{
  "name": "Jamie Rivera",
  "email": "jamie@example.com",
  "phone": "555-019-2044",
  "service": "plumbing",
  "message": "Kitchen sink is leaking under the cabinet."
}
```

**App → n8n** — `POST {N8N_WEBHOOK_URL}` (fire-and-forget; a slow/down n8n
never fails the visitor's submission, since the lead is already in Postgres
by this point)
```json
{
  "leadId": "5b1f...-uuid",
  "name": "Jamie Rivera",
  "email": "jamie@example.com",
  "phone": "555-019-2044",
  "service": "plumbing",
  "message": "Kitchen sink is leaking under the cabinet.",
  "source": "website",
  "submittedAt": "2026-09-12T09:14:00.000Z"
}
```

**n8n → GHL** — `POST https://services.leadconnectorhq.com/contacts/upsert`
```json
{
  "locationId": "{{GHL_LOCATION_ID}}",
  "firstName": "Jamie",
  "lastName": "Rivera",
  "email": "jamie@example.com",
  "phone": "555-019-2044",
  "tags": ["new-lead-plumbing"],
  "source": "website-lead-form",
  "customFields": [
    { "key": "service_requested", "field_value": "plumbing" },
    { "key": "initial_message", "field_value": "Kitchen sink is leaking under the cabinet." }
  ]
}
```

**GHL → n8n → App** — the GHL Workflow's own "Webhook" action calls n8n,
which maps the event and calls back into the app:
```json
{ "email": "jamie@example.com", "status": "booked" }
```
sent to `POST /api/leads/status` with header `x-internal-token: {INTERNAL_API_TOKEN}`.

## Running it locally first

Before touching a VPS, the whole loop (app → n8n → GHL → n8n → app) can be
proven out on a laptop with just Docker Desktop and Node installed. This is
the actual sequence used to validate this project, gotchas included — worth
following before deploying, since it's much cheaper to hit these problems
locally than on a production box.

### 1. Postgres

```bash
docker run -d --name brightfix-pg \
  -e POSTGRES_USER=leaduser -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=leads \
  -p 5434:5432 \
  postgres:16-alpine
docker exec -i brightfix-pg psql -U leaduser -d leads < db/init.sql
```

**Gotcha:** don't assume port 5432 (or even 5433) is free. A machine that's
ever had PostgreSQL installed natively — via the Windows installer, Homebrew,
`apt`, a Postgres.app, etc. — is often already listening there, and Docker's
`-p 5432:5432` mapping can silently lose that fight (Docker itself reports
success; connections just get routed to the wrong server, producing a
confusing "password authentication failed" error even with the right
password for the *container's* user). Confirm with `netstat -ano | grep 5432`
(Windows) / `lsof -i :5432` (macOS/Linux) before assuming the container is
what's answering, and pick a clearly-unused port (5434 here) if anything else
is already bound.

**Gotcha (Windows/Git Bash only):** mounting `db/init.sql` via `-v` from Git
Bash gets its path silently mangled by MSYS path conversion (the container
ends up with a mount destination like `\Program Files\Git\docker-entrypoint-
initdb.d\...`, so the script never runs and the `leads` table is never
created). Piping the schema in directly with `docker exec -i ... psql < db/init.sql`
(as above) sidesteps it entirely.

### 2. The app

```bash
npm install
```

Create `.env.local` (already gitignored — never commit this):
```
DATABASE_URL=postgres://leaduser:devpass@localhost:5434/leads
N8N_WEBHOOK_URL=http://localhost:5678/webhook/lead-intake
INTERNAL_API_TOKEN=devtoken123
```

```bash
npm run dev
```

`N8N_WEBHOOK_URL` is read as optional by `/api/leads` — leaving it unset
still lets leads save to Postgres, useful for testing the form in isolation
before n8n is wired up.

### 3. n8n

```bash
docker volume create brightfix-n8n-data
docker run -d --name brightfix-n8n \
  -e N8N_HOST=localhost -e N8N_PROTOCOL=http \
  -e WEBHOOK_URL=http://localhost:5678/ \
  -e GENERIC_TIMEZONE=Asia/Manila \
  -e APP_STATUS_WEBHOOK_URL=http://host.docker.internal:3000/api/leads/status \
  -e INTERNAL_API_TOKEN=devtoken123 \
  -e GHL_LOCATION_ID=<your GHL location id> \
  -e N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
  -v brightfix-n8n-data:/home/node/.n8n \
  -p 5678:5678 \
  n8nio/n8n:latest
```

Two things worth calling out:

- **Always mount a volume** (`/home/node/.n8n`) from the first run. Without
  one, the owner account, imported workflows, and credentials all live only
  in the container's writable layer — recreating the container (e.g. to add
  an env var) wipes all of it, and you redo onboarding from scratch.
- **`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is required.** Recent n8n versions
  block workflow expressions from reading `$env` by default as a security
  hardening measure. Both workflows here reference `$env.GHL_LOCATION_ID`,
  `$env.APP_STATUS_WEBHOOK_URL`, and `$env.INTERNAL_API_TOKEN` — without this
  flag, the "Upsert GHL Contact" node fails with `access to env vars denied`.
  It's safe to disable for a single-tenant local/VPS instance you control;
  leave it enabled (the default) on a shared or multi-tenant n8n instance.
- Since the app runs on the host (`npm run dev`) and n8n runs in Docker, the
  callback workflow reaches the app via Docker's `host.docker.internal`
  hostname, not `localhost`.

Open `http://localhost:5678` and walk through first-run setup:

| | |
|---|---|
| ![n8n owner account setup](docs/screenshots/n8n-owner-setup.png) | **Create the owner account.** First-run screen — any email/password works for local testing. |
| ![n8n AI Assistant onboarding](docs/screenshots/n8n-ai-assistant-onboarding.png) | **Skip via "Set up later in Settings."** Not needed to run these two workflows. |
| ![n8n free license key offer](docs/screenshots/n8n-license-key-offer.png) | **Safe to skip.** Advanced debugging/search/folders aren't needed for a two-workflow test. |
| ![n8n customize survey](docs/screenshots/n8n-customize-survey.png) | **Cosmetic only** — answer anything, it doesn't affect functionality. |

### 4. Import and wire the workflows

Import both `n8n/lead-intake-workflow.json` and `n8n/ghl-callback-workflow.json`
(new workflow → **⋯** → **Import from File**). If both land on the same
canvas because you imported the second one into the still-open first
workflow instead of a fresh blank one, that's harmless — n8n activates every
trigger node in a workflow independently, so both webhook paths
(`/webhook/lead-intake` and `/webhook/ghl-status-callback`) still register
correctly either way.

Get GHL credentials for the "Upsert GHL Contact" node: in your GHL
sub-account, **Settings → Private Integrations** → create one scoped to
`contacts.write` + `contacts.readonly`, copy the token, and create an
**HTTP Header Auth** credential in n8n with header `Authorization` = `Bearer
<token>`. The Location ID comes from the sub-account's settings URL
(`/location/<LOCATION_ID>/...`).

| | |
|---|---|
| ![Missing credential warning](docs/screenshots/n8n-credential-warning.png) | **The warning triangle** on "Upsert GHL Contact" means the HTTP Header Auth credential isn't wired up yet — click the node → **Connect to Header Auth** → **Create New** to fix it. |

Click **Publish** (or **Activate**) once the warning clears.

### 5. Fire a test lead end to end

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -d '{"name":"Jamie Rivera","email":"jamie@example.com","phone":"555-019-2044","service":"plumbing","message":"Kitchen sink is leaking under the cabinet."}'
```

| | |
|---|---|
| ![Lead form, empty](docs/screenshots/lead-form-empty.png) | The form a visitor sees. |
| ![Lead form, submitted](docs/screenshots/lead-form-submitted.png) | Confirmation state after a successful `POST /api/leads` — the lead is now in Postgres and the n8n webhook has fired. |
| ![n8n execution — lead intake succeeded](docs/screenshots/n8n-execution-lead-intake.png) | In n8n's **Executions** tab: the Lead Webhook branch ran green — Postgres → n8n → GHL contact upsert all succeeded. |
| ![n8n execution — GHL callback succeeded](docs/screenshots/n8n-execution-ghl-callback.png) | Simulating GHL's status-change webhook (`curl .../webhook/ghl-status-callback`) exercises the other branch — n8n → app → Postgres status update. |

Confirm in Postgres directly if you want to see the full round trip:
```bash
docker exec brightfix-pg psql -U leaduser -d leads -c "select name, email, status from leads;"
```

### What local testing doesn't cover

GHL's own tag-triggered Workflow (the piece that fires the welcome
SMS/email and calls the "Webhook" action back to n8n) lives entirely in
GHL's cloud, which can't reach `http://localhost:5678`. To test that specific
leg without deploying, tunnel it — `ngrok http 5678` and point the GHL
Workflow's Webhook action at the ngrok URL — or just deploy to the VPS
(below) and point it at the real domain. Everything else in the architecture
diagram (app, Postgres, both n8n workflows, the real GHL contacts API) is
fully exercised by the steps above.

## Deploying it

### 1. Provision the VPS

1. Create a droplet/instance — DigitalOcean or Vultr, Singapore region if
   you're latency-sensitive, Ubuntu 24.04 LTS, 2 GB RAM (1 GB is tight once
   Postgres + n8n + the app are all running). Add your SSH key at creation.
2. Point DNS: two A records at the VPS's IP — one for the app
   (`app.yourdomain.com`) and one for n8n (`n8n.yourdomain.com`). If you
   don't have a domain yet, buy a cheap one (Namecheap/Porkbun, ~$10–12/yr)
   — Caddy's automatic HTTPS and GHL's webhook delivery both need a real
   domain, not a bare IP.
3. SSH in as root, create a non-root sudo user, set up UFW
   (`ufw allow 22,80,443/tcp`), and disable root/password SSH login.
4. Install Docker + the Compose plugin
   (`curl -fsSL https://get.docker.com | sh`, then
   `sudo apt install docker-compose-plugin`).

### 2. Deploy the stack

```bash
git clone <your-repo-url> brightfix && cd brightfix
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, INTERNAL_API_TOKEN, APP_DOMAIN, N8N_DOMAIN,
# and N8N_WEBHOOK_URL (https://n8n.yourdomain.com/webhook/lead-intake)
docker compose up -d --build
```

First load of `https://n8n.yourdomain.com` shows n8n's owner-account setup
screen (self-hosted n8n now uses its own user management rather than basic
auth) — create your login there.

### 3. Set up GHL

1. Start a free GHL trial, create a sub-account ("location").
2. Settings → Private Integrations → create a token scoped to
   `contacts.write` and `contacts.readonly`. This is simpler than a full
   OAuth app for a single-account internal tool like this one — OAuth is for
   apps installed on accounts you don't own.
3. Build one real GHL Workflow: trigger = "Tag added" (`new-lead-plumbing`,
   etc.), actions = send a welcome SMS/email, wait, then an internal
   notification. Add a final "Webhook" action pointing at
   `https://n8n.yourdomain.com/webhook/ghl-status-callback` so GHL can report
   status changes back.

### 4. Import and wire the n8n workflows

1. In n8n: Settings → Import Workflow → `n8n/lead-intake-workflow.json`.
   Add an HTTP Header Auth credential (`Authorization: Bearer
   <your GHL Private Integration Token>`) and set `GHL_LOCATION_ID` as an
   n8n environment variable. Activate the workflow.
2. Import `n8n/ghl-callback-workflow.json`. Set `APP_STATUS_WEBHOOK_URL`
   (`https://app.yourdomain.com/api/leads/status`) and reuse
   `INTERNAL_API_TOKEN` from `.env` as an n8n environment variable. Activate.

### 5. Run the MCP server (optional, local)

```bash
cd mcp-server
npm install && npm run build
# tunnel to the VPS's Postgres rather than exposing 5432 publicly:
ssh -L 5433:localhost:5432 you@your-vps-ip
DATABASE_URL=postgres://leaduser:<password>@localhost:5433/leads npm start
```
Then add it to Claude Code/Desktop's MCP config pointing at
`node mcp-server/dist/index.js` with that `DATABASE_URL`.

## How this was built

This scaffold (Next.js app, API routes, Postgres schema, Docker Compose
stack, Caddyfile, and n8n workflow JSON) was drafted as a fast-start
baseline. Treat it as a first draft, not a finished, Claude-Code-built
project: open it in Claude Code and actually work it — extend a feature,
fix whatever breaks on first deploy, adjust the design, debug the Docker
build on your VPS — before describing it as built with Claude Code. That
real second pass is also what gives you something concrete to say when
asked how you built it and why, rather than a description of a repo you
received. Decisions worth calling out from the initial draft:

- **Fire-and-forget webhook, not a queue.** For this volume (a small local
  business's lead form) a message queue would be over-engineering; the
  trade-off is that if n8n is down when a lead comes in, that one lead
  doesn't reach GHL automatically until it's retried manually. Documented
  here rather than hidden, since the JD explicitly wants to know *why*.
- **Two n8n workflows instead of one.** The JD's phrase "GHL Automations,
  connecting to n8n" reads as bidirectional, not just "n8n calls GHL" — so
  the project includes both a forward (app → GHL) and backward (GHL → app)
  flow, closing the loop instead of leaving it one-way.
- **Private Integration Token over full OAuth.** OAuth 2.0 is the right
  choice for a distributable app installed on other people's GHL accounts;
  for a single internal sub-account, a PIT is far less setup for the same
  security properties.

## Known limitations / next steps

- No retry queue if the app → n8n webhook fails (see above).
- The MCP server is read-only by design; write tools (e.g. "add a note to a
  lead") were left out to keep the agent's blast radius small for a v1.
- GHL webhook payloads should be signature-verified (GHL signs with Ed25519)
  before being trusted — not yet implemented in the callback workflow.
