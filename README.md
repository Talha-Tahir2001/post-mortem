# Post Mortem

**Talk through the incident. We'll write the postmortem.**

A voice-first incident war room built on the **AssemblyAI Voice Agent API**: an agent runs your
verbal triage checklist out loud, pulls live deploy and health data through tools, records
severity/checklist/action items into your dashboard *while you speak* — then turns the call's
session timeline into a complete postmortem report.

[**Live demo**](https://post-mortem-bay.vercel.app) ·
[**Repository**](https://github.com/Talha-Tahir2001/post-mortem) ·
Built for the [AssemblyAI Voice Agent Hackathon (lablab.ai)](https://lablab.ai)

![Live demo](https://img.shields.io/badge/live-post--mortem--bay.vercel.app-2563eb)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-61dafb)
![AssemblyAI](https://img.shields.io/badge/AssemblyAI-Voice%20Agent%20API-111111)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Table of contents

- [Why](#why)
- [Demo](#demo)
- [Features](#features)
- [How it works](#how-it-works)
- [The seven tools](#the-seven-tools)
- [API routes](#api-routes)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Deploying to Vercel](#deploying-to-vercel)
- [Refreshing the stored agent](#refreshing-the-stored-agent)
- [How the postmortem is generated](#how-the-postmortem-is-generated)
- [Known limitations](#known-limitations)
- [License](#license)

---

## Why

At 2 AM an on-call engineer has three tabs open and a blank document titled "Postmortem".
Post Mortem replaces all of it with a conversation: you **talk** through triage, the agent
**does the typing**, and the document that used to take an hour to write exists before you
close the incident.

The demo hook is a **chaos toggle** — flip it mid-call and the agent discovers a failing
checkout service (502s, degraded p95) *by voice*, ticking the checklist as it goes.

## Demo

> Replace the placeholders below with your recording once it's up.

<!-- **Video (~90s):** [watch the walkthrough](docs/video.mp4) -->

<!-- **GIF:**
![Post Mortem — live voice triage](docs/demo.gif) -->

1. Open the [live app](https://post-mortem-bay.vercel.app) and press **Start incident**.
2. Click **Connect & speak** (Chrome/Edge) and allow microphone access.
3. Say things like *"What deployed recently?"*, *"Check checkout"*, *"This is a SEV1"*,
   *"Add action item: roll back deploy, owner Priya"*.
4. Flip the **chaos toggle** mid-call and ask the agent to check the service again.
5. End the call — the postmortem builds itself at `/postmortem/<id>`.

A **Load demo** button in the war room pre-seeds a believable mid-incident state (severity,
checklist progress, action items, tool log) so every panel has content before you start.

## Features

**Live voice triage** — streaming speech in/out over the AssemblyAI Voice Agent API with
barge-in (you can interrupt the agent), a live mic waveform, and connect/disconnect cues.

**Seven tools, two runtimes** — deploy history is a server-side HTTP tool called by
AssemblyAI; health, error rate, severity, checklist and action items are function tools
answered by your browser against the live war-room state, so panels move mid-sentence.

**A war room that reacts** — severity badge, service-health grid, deploy feed, status-page
preview, seven-step triage checklist, action items, tool log, and a chaos toggle that makes
the incident real for the agent.

**Postmortem from the session timeline** — on `session.end` the app fetches the official
session timeline artifact, extracts measured facts, and generates a structured report:
summary, impact, event timeline, root-cause hypotheses, action items, and what went
well/poorly.

**Two report sources, honestly labelled** — the report badge shows `llm` when it came from
the AssemblyAI **LLM Gateway** (structured output), or `offline fallback` when the Gateway is
unavailable — in which case a deterministic analyzer derives the report from the transcript,
so the demo never dies.

**Transcript tab, Markdown export, shareable URLs** — every report page doubles as the raw
conversation view, with Copy/Download-Markdown buttons and localStorage caching
(`localStorage` keyed by session, no server-side storage of report content).

## How it works

```
┌─────────────────────────── Browser (Chrome/Edge) ───────────────────────────┐
│  Mic ─► AudioWorklet (/worklets/pcm-processor.js)                           │
│          resample → 24 kHz PCM16 → base64 chunks                            │
│                                                                             │
│  WebSocket  wss://agents.assemblyai.com/v1/ws   ◄── single-use token       │
│  ┌─ session.update { agent_id }                                             │
│  ├─ input_audio_buffer.append / commit  ──►  streaming ASR                  │
│  └─ conversation.item + response.create ◄──  streaming TTS deltas           │
│                                                                             │
│  Six function tools answered in-page (war-room state):                      │
│    check_service_health · get_error_rate · update_checklist                 │
│    add_action_item · set_severity · respond_freely                          │
│  tool.results queued, flushed on reply.done                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                 │                                    │
                 │ tool.call (HTTP)                    │ POST /api/postmortem
                 ▼                                    ▼
┌─────────────────────────┐            ┌───────────────────────────────────────┐
│ AssemblyAI Voice Agent  │            │  Next.js (Vercel, Node runtime)      │
│ · stored agent          │── GET ───► │  /api/voice-token  → minted token    │
│ · voice "charles"       │            │  /api/sim/deploys  → HTTP tool target│
│ · VAD + barge-in        │            │  /api/transcript   → flattened turns │
└─────────────────────────┘            │  /api/postmortem   → report          │
                                       └───────────────┬───────────────────────┘
                                                       │
                     session timeline artifact         │  hard facts + prompt
                     (GET /v1/sessions/{id}) ──────────┤
                                                       ▼
                                       AssemblyAI LLM Gateway (structured JSON)
                                       or deterministic offline fallback
```

### Audio pipeline

- The microphone is captured by an **AudioWorklet** (`public/worklets/pcm-processor.js`)
  that resamples whatever the input device gives us to the agent's expected
  **24 kHz PCM16**, and emits chunks over `postMessage`.
- The client sends `session.update` with the agent id, streams audio, and plays back the
  agent's PCM deltas with the same worklet graph.
- A **single-use token** is minted server-side (`expires_in_seconds=300`,
  `max_session_duration_seconds=1800`) so the AssemblyAI API key never reaches the browser.
- On `pagehide`/teardown the client sends `session.end` synchronously to stop billing.

### Tool model

- **HTTP tool (1):** `get_recent_deploys` → `GET /api/sim/deploys?service=…`. Called by
  AssemblyAI itself. It is stateless and secret-free by design, so it runs fine on Vercel.
- **Function tools (6):** answered by the responder's browser from the war-room's live state,
  so they can reflect in-app changes the server can't see (the chaos toggle).
- All tool results are **queued and flushed on `reply.done`**, capped to keep the agent from
  calling tools during unrelated chatter.

## The seven tools

| Tool | Runs where | What it does | Drives |
|---|---|---|---|
| `get_recent_deploys(service)` | **HTTP** — `GET /api/sim/deploys` | Last five deploys, newest first: hash, author, message, when it shipped | Deploy feed |
| `check_service_health(service)` | Browser (function) | Status, HTTP code and p95 latency for `checkout` / `api` / `web` | Service health grid |
| `get_error_rate(service, window)` | Browser (function) | Error percentage over the last `5m` or `1h` | Health readout |
| `set_severity(level)` | Browser (function) | Records SEV1/SEV2/SEV3 the moment you say it | Severity badge |
| `update_checklist(step, status)` | Browser (function) | Ticks/starts/skips one of the seven triage steps | Checklist panel |
| `add_action_item(task, owner)` | Browser (function) | Captures a follow-up the moment you mention one | Action items panel |
| `respond_freely()` | Browser (function) | Escape hatch for small talk; writes nothing | Transcript only |

> **Why the split?** HTTP tools must be `https://` on a public host (AssemblyAI enforces
> this), and only stateless data can live on a server that has no incident state. Anything
> that must react to what's happening *inside the page* runs in the browser.
> See [Refreshing the stored agent](#refreshing-the-stored-agent) for how the HTTP tool
> downgrades itself when `APP_URL` isn't public.

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/voice-token` | `GET` | Mints a single-use voice token + returns the agent id. **The API key never leaves the server.** |
| `/api/sim/deploys` | `GET` | Target of the `get_recent_deploys` HTTP tool. Seeded deploy history (`?service=checkout`), no secrets. |
| `/api/transcript` | `GET` | Flattens the session timeline into `{ messages, turns, duration }` for the report's Transcript tab. |
| `/api/postmortem` | `POST` | Fetches the timeline artifact, computes hard facts, calls the LLM Gateway (or the offline fallback), returns `{ facts, postmortem, source }`. |

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui built on **Base UI** |
| Icons | `@tabler/icons-react` |
| Voice | [AssemblyAI Voice Agent API](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/) (WebSocket, single-use tokens) |
| LLM | [AssemblyAI LLM Gateway](https://www.assemblyai.com/docs/llm-gateway/quickstart) (`response_format` structured output), with an offline fallback |
| Hosting | Vercel (Node runtime serverless) |

## Project structure

```
app/
  page.tsx                     Landing: pitch, tools, flow, FAQ, real transcript excerpt
  incident/[id]/page.tsx       The war room (voice call + live panels)
  postmortem/[id]/page.tsx     Report page (Findings / Transcript tabs)
  api/
    voice-token/route.ts       Mint single-use token
    sim/deploys/route.ts       HTTP tool target (seeded deploys)
    transcript/route.ts        Flattened session transcript
    postmortem/route.ts        Report generation (LLM Gateway + fallback)
components/
  war-room/                    Checklist, severity, health grid, deploy feed,
                               status page, action items, chaos toggle, layout
  voice/                       Call controls, mic waveform, voice call, transcript panel
  report/                      Findings cards, timeline, transcript tab, postmortem view
  ui/                          shadcn/ui components (Base UI)
hooks/
  use-voice-session.ts         WS/audio core: tokens, AudioWorklet, playback, barge-in
  use-incident-state.ts        War-room state store + tool execution
lib/
  assemblyai.ts                Token minting, session/timeline fetch helpers
  llm-gateway.ts               Gateway/OpenAI-compatible client + error phrasing
  timeline.ts                  Timeline artifact → messages + measured hard facts
  session-timeline.ts          Shared loader used by transcript + postmortem routes
  postmortem-schema.ts         Zod schemas for the report
  sim.ts / tools.ts / types.ts Seeded incident data, tool definitions, shared types
  markdown.ts, storage.ts      Report export + localStorage cache
agents/post-mortem.jsonc       The stored agent definition (prompt, voice, tools)
scripts/publish-agent.mjs      Publishes/updates the agent via the AssemblyAI API
public/worklets/pcm-processor.js  Mic capture + playback worklet
PLAN.MD                        Full project plan, schedules, submission checklist
```

## Getting started

### Prerequisites

- **Node.js ≥ 20** (Next.js 16 requirement)
- An [AssemblyAI account](https://www.assemblyai.com/) with the Voice Agent API available
- **Chrome or Edge** for the demo (microphone + AudioWorklet)

### 1. Install

```bash
git clone https://github.com/Talha-Tahir2001/post-mortem.git
cd post-mortem
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in at minimum `ASSEMBLYAI_API_KEY`, then run the publish script (step 3) to write
`AGENT_ID_POST_MORTEM` for you. See [Environment variables](#environment-variables) for the
full list.

### 3. Publish the stored agent

```bash
npm run publish:agent
```

Creates (or updates) the **Post Mortem Incident Commander** agent from
`agents/post-mortem.jsonc` — system prompt, voice, VAD settings, and all seven tool
definitions — then persists its id to `.env` as `AGENT_ID_POST_MORTEM`.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000, click **Start incident**, then **Connect & speak** and allow the
microphone. The app works fully over `localhost` (the HTTP tool transparently falls back to
a browser-answered function tool — see below).

### Available scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` | Prettier write |
| `npm run publish:agent` | Publish/refresh the agent from `agents/post-mortem.jsonc` |

## Environment variables

All server-side; none are exposed to the browser.

| Variable | Required | Description |
|---|---|---|
| `ASSEMBLYAI_API_KEY` | **Yes** | Server-only key. Used to mint tokens, fetch session timelines, publish the agent, and (by default) authenticate to the LLM Gateway. |
| `AGENT_ID_POST_MORTEM` | **Yes** | Id of the stored agent. Written automatically by `npm run publish:agent`. |
| `APP_URL` | **Yes (deploy)** | Base URL of the app, substituted into the HTTP tool URL at publish time. `http://localhost:3000` locally, `https://<your-app>.vercel.app` in production. |
| `POSTMORTEM_MODEL` | No | Model used for the structured report (default `gemini-3.8-flash`). |
| `LLM_BASE_URL` | No | Bring-your-own LLM: any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, local…). |
| `LLM_API_KEY` | No | Key for that endpoint. Set **both** `LLM_*` values when your AssemblyAI account has no Gateway access. |

## Deploying to Vercel

1. **Import the repo** at [vercel.com/new](https://vercel.com/new) (or `vercel --prod` from
   the CLI).
2. **Add the environment variables** above in *Project → Settings → Environment Variables*,
   with `APP_URL=https://<your-app>.vercel.app`.
3. Deploy. `maxDuration` on the report route is 60s, well inside Vercel's limits.
4. **Re-publish the agent against production** (critical — see next section). The script
   reads `APP_URL` from the shell first, then `.env.local`, then `.env`:

   ```bash
   # macOS / Linux
   APP_URL=https://<your-app>.vercel.app npm run publish:agent
   ```
   ```powershell
   # Windows PowerShell
   $env:APP_URL = "https://<your-app>.vercel.app"; npm run publish:agent
   ```

   Or just set `APP_URL` in `.env` and run `npm run publish:agent`.

5. Smoke test in Chrome: `/` loads, `/api/voice-token` returns a token, a live call reaches
   `/api/sim/deploys`, and ending the call renders the report.

## Refreshing the stored agent

`scripts/publish-agent.mjs` reads `agents/post-mortem.jsonc`, substitutes `${APP_URL}` into
the HTTP tool URL, and upserts the agent.

- **`APP_URL` is public `https://`** → `get_recent_deploys` is published as a real
  **server-side HTTP tool** (AssemblyAI calls it directly).
- **`APP_URL` is `http://` or localhost** → AssemblyAI rejects loopback/private hosts, so the
  script *downgrades* the tool to a **function tool** and the browser answers it from the same
  `/api/sim/deploys` endpoint. Everything still works; the difference is only *who* makes the
  HTTP call.

So: swap `APP_URL` to production, re-run `npm run publish:agent`, and the webhook path is
restored. Re-run it any time the URL or the tool definitions change.

## How the postmortem is generated

1. The client sends `{ sessionId, title, severity, actionItems }` to `POST /api/postmortem`.
   **Severity and action items from the responder are the source of truth.**
2. The route fetches `GET /v1/sessions/{sessionId}` for the **session timeline artifact**
   (fetched fresh — URLs expire, never stored).
3. `lib/timeline.ts` flattens turns into messages and extracts **measured hard facts**
   server-side: duration, turn counts, median time-to-first-audio, and the tool-call list.
4. A structured-output completion is requested from the **AssemblyAI LLM Gateway**
   (`response_format` JSON schema, `post_processing_steps: json-repair`) with a strict
   anti-fabrication prompt: only transcript/tool provenance may be stated as fact.
5. **Fallback:** if the Gateway/model is unavailable, `deriveFromTranscript()` builds a
   deterministic report from the same messages and facts. The response carries
   `source: "llm" | "fallback"`, which the report page renders as a badge.
6. The result is cached in `localStorage` and rendered at `/postmortem/[id]` with Findings
   and Transcript tabs, plus Copy/Download-Markdown export.

## Known limitations

- **Chrome/Edge first.** The capture path relies on `getUserMedia` + `AudioWorklet`; other
  browsers are untested.
- **LLM Gateway access is per-account.** If your AssemblyAI account has no Gateway access (or
  you haven't set `LLM_BASE_URL`/`LLM_API_KEY`), reports are produced by the offline
  fallback — clearly badged, never a blank page.
- **English voice demo.** Keyterms and the transcription prompt are tuned for incident
  vocabulary in English.
- **Sessions cap at 30 minutes** (`max_session_duration_seconds=1800`) to avoid billing
  surprises; tokens expire after 5 minutes.
- **Seeded incident data.** Deploys, health and error rates are simulated — this is a demo
  war room, not a real observability stack. No real outage required (or possible).

## License

MIT © Talha Tahir. See [LICENSE](LICENSE).
