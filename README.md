# ◆ opencode mission control

A zero-dependency, real-time dashboard for monitoring your [opencode](https://opencode.ai) sessions — see every agent, every tool call, every token, and every dollar at a glance.

![status](https://img.shields.io/badge/dependencies-0-3fb950) ![node](https://img.shields.io/badge/node-%E2%89%A522-58a6ff) ![license](https://img.shields.io/badge/license-MIT-bc8cff)

## What it does

opencode mission control reads opencode's local SQLite database and log files and turns them into a live mission-control view:

- **Session list** with live status (working / active / idle / stuck), cost, model, agent, and todo progress per session
- **Global activity feed** streaming tool calls, text output, and reasoning from every session in real time (SSE)
- **Session detail** with full prompt, todos, an interactive activity timeline (expandable tool outputs, reasoning blocks, patches), and a live log tail
- **Header stats**: active sessions, opencode processes, stuck sessions, and 24h spend
- **Search & filters** across titles, prompts, and working directories

Everything updates live via Server-Sent Events, with automatic polling fallback and exponential-backoff reconnect.

## Quick start

```bash
git clone git@github.com:gerardocipriano/opencode-dashboard.git
cd opencode-dashboard
./start.sh          # or: node server.js
```

Open **http://localhost:3456**. That's it — no `npm install`, no build step.

> Requires Node.js ≥ 22 (uses the built-in `node:sqlite` module) and opencode installed and used at least once (the dashboard reads `~/.local/share/opencode/opencode.db`).

Custom port:

```bash
PORT=8080 node server.js
```

## How it works

```
~/.local/share/opencode/opencode.db   ──┐
~/.local/share/opencode/log/*.log     ──┼──▶  server.js (plain node:http + node:sqlite)
~/.local/state/opencode/locks/        ──┘         │
                                                  ▼  REST + SSE
                                          public/index.html
                                       (single-file vanilla UI)
```

| Endpoint | Purpose |
|---|---|
| `GET /api/overview` | Sessions with status, cost, todos, last activity |
| `GET /api/session?id=` | Full session detail: messages, parts, tokens |
| `GET /api/stream` | SSE: live overview + new message parts |
| `GET /api/log-stream?sessionId=` | SSE: live log tail per session |
| `GET /api/log-archive?sessionId=` | Recent archived log lines |
| `GET /api/processes` | Running opencode processes (via `/proc`) |
| `GET /api/health` | DB availability check |

## Design

The UI is a single self-contained HTML file — dark GitHub-inspired palette, no frameworks, no external fonts, no CDN. It follows the [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines): visible focus rings, keyboard-accessible interactions, `prefers-reduced-motion` support, tabular numerals for metrics, WCAG AA contrast, and live regions for streaming updates.

## License

MIT
