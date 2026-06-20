# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nightwatch is a game built for Reddit's Devvit Web platform for the "Games with a Hook" hackathon. It runs as an interactive post inside Reddit feeds. Players act as a night watchman: creatures approach from the dark, and the player must tap **Lantern** (let friendlies in) or **Bell** (ward threats off) before they reach the tower.

## Tech Stack

- **Client**: Three.js + TypeScript, bundled with Vite
- **Server**: Hono (lightweight web framework) on Devvit's server runtime
- **Shared**: TypeScript types in `src/shared/` used by both client and server
- **Platform**: Devvit Web — Reddit's developer platform for interactive posts

## Build & Dev Commands

```bash
npm run dev          # Start Devvit playtest (live dev on Reddit)
npm run build        # Vite build → dist/client/ + dist/server/
npm run type-check   # Type-check client and server separately
npm run lint         # ESLint on src/**/*.{ts,tsx}
npm run deploy       # Type-check + lint + devvit upload
npm run launch       # Deploy + devvit publish
npm run login        # Authenticate CLI with Reddit
```

## Architecture

The project follows Devvit's client/server split pattern:

- **`src/client/`** — Two HTML entrypoints defined in `devvit.json`:
  - `splash.html` (inline, default) — title screen shown in Reddit feed
  - `game.html` — full Three.js game scene, opened when user clicks Play
  - Splash→Game navigation uses `requestExpandedMode(event, 'game')` from `@devvit/web/client`

- **`src/client/engine/`** — Game engine modules:
  - `GameManager.ts` — game loop, scoring, spawn timing, state transitions
  - `Creature.ts` — creature entities (friendly/threat), approach + dismiss animations
  - `World.ts` — Three.js scene, camera, lighting, environment

- **`src/server/`** — Hono app (`index.ts`) mounting routes:
  - `/api/*` — game API endpoints (client fetches these)
  - `/internal/menu/*` — subreddit menu actions (e.g., "Create Nightwatch Post")
  - `/internal/form/*` — Devvit form handlers
  - `/internal/triggers/*` — app lifecycle events (install, etc.)
  - `core/post.ts` — creates Reddit custom posts via `reddit.submitCustomPost()`

- **`src/shared/api.ts`** — Response types shared between client and server

## TypeScript Configuration

Client and server have separate tsconfig files because `@devvit/web` uses conditional exports (`browser` for client, `default` for server). Importing from the wrong context triggers a panic at build time.

- `tsconfig.client.json` — includes `src/client` + `src/shared`, uses `customConditions: ["browser"]`
- `tsconfig.server.json` — includes `src/server` + `src/shared`, no browser condition
- `tsconfig.json` — project references root (not used directly)

## Key Constraints

- Devvit Web apps must work well on mobile — test responsive behavior
- The Vite build uses `@devvit/start/vite` plugin which handles the client/server split automatically
- Server entry compiles to `dist/server/index.cjs` (CommonJS)
- Three.js bundles are large — `chunkSizeWarningLimit` is set to 3000 in vite config
- Node.js ≥22.2.0 required
- Menu endpoints must return `UiResponse` type (e.g., `{ navigateTo: url }` or `{ showToast: msg }`), not plain JSON
