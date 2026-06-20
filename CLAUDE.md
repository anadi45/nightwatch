# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nightwatch is a game built for Reddit's Devvit Web platform. It runs as an interactive post inside Reddit feeds.

## Tech Stack

- **Client**: Three.js + TypeScript, bundled with Vite
- **Server**: Hono (lightweight web framework) on Devvit's server runtime
- **Shared**: TypeScript types in `src/shared/` used by both client and server
- **Platform**: Devvit Web — Reddit's developer platform for interactive posts

## Build & Dev Commands

```bash
npm run dev          # Start Devvit playtest (live dev on Reddit)
npm run build        # Vite build → dist/client/ + dist/server/
npm run type-check   # tsc --noEmit
npm run lint         # ESLint on src/**/*.{ts,tsx}
npm run deploy       # Type-check + lint + devvit upload
npm run launch       # Deploy + devvit publish
npm run login        # Authenticate CLI with Reddit
```

## Architecture

The project follows Devvit's client/server split pattern:

- **`src/client/`** — Two HTML entrypoints defined in `devvit.json`:
  - `splash.html` (inline, default) — loading/title screen shown in Reddit feed
  - `game.html` — full Three.js game scene, opened when user clicks Play
  - Splash→Game navigation uses `postMessage` with `{ type: 'devvit-navigate', entrypoint: 'game' }`

- **`src/server/`** — Hono app (`index.ts`) mounting routes:
  - `/api/*` — game API endpoints (client fetches these)
  - `/internal/menu/*` — subreddit menu actions (e.g., "Create Nightwatch Post")
  - `/internal/form/*` — Devvit form handlers
  - `/internal/triggers/*` — app lifecycle events (install, etc.)

- **`src/shared/api.ts`** — Response types shared between client and server

- **`devvit.json`** — Devvit app config: entrypoints, server entry, menu items, triggers

## Key Constraints

- Devvit Web apps must work well on mobile — test responsive behavior
- The Vite build uses `@devvit/start/vite` plugin which handles the client/server split automatically
- Server entry compiles to `dist/server/index.cjs` (CommonJS)
- Three.js bundles are large — `chunkSizeWarningLimit` is set to 3000 in vite config
- Node.js ≥22.2.0 required
