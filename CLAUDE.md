# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nightwatch is a first-person Three.js game built for Reddit's Devvit Web platform for the "Games with a Hook" hackathon. It runs as an interactive post inside Reddit feeds. Players hold a lantern and torch in first person. Survivors and ghosts approach from the dark. Players must tap on **ghosts** to flash their torch and banish them, while letting **human survivors** reach safety. The core challenge is quick identification under time pressure.

## Gameplay

- **60-second timed sessions** with escalating difficulty
- **Humans** (blue eyes, upright, running gait) flee straight toward the player at 1.5x speed
- **Ghosts** (red eyes, translucent, floating, trailing wisps) use tricky movement patterns (weave, zigzag, flank) at base speed
- **Tap on a creature** to flash your torch light on it:
  - Ghost → disintegrates (score +1, streak continues)
  - Human → streak resets (survivor stays, keeps approaching)
- **Ghost reaching the player** = miss (streak breaks, speed penalty)
- **Human reaching the player** = peaceful vanish (neutral, they made it to safety)
- Consecutive misses make evil creatures approach faster

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
  - `game.html` — full Three.js game scene with CSS loader, opened when user clicks Play
  - Splash→Game navigation uses `requestExpandedMode(event, 'game')` from `@devvit/web/client`

- **`src/client/engine/`** — Game engine modules:
  - `GameManager.ts` — game loop, raycasting for tap-on-creature input, scoring, spawn timing, state transitions. Render loop runs from construction (scene visible behind ready/end overlays).
  - `Creature.ts` — two creature types built from Three.js primitives:
    - **Human** (survivor): SphereGeometry head with hair, BoxGeometry torso in warm tunic, CylinderGeometry arms/legs with running gait animation, blue eyes
    - **Ghost** (threat): translucent LatheGeometry body tapering to wispy tail, floating SphereGeometry head, trailing arm wisps, tail tendrils, additive glow aura, red flickering eyes, ethereal hover animation
    - Shared: movement patterns (straight/weave/zigzag/flank), state machine (approaching→disintegrating/fading), invisible hit sphere for forgiving tap targets, torch flash effect (PointLight burst on tap)
  - `Hands.ts` — first-person hands attached to the camera. Left hand holds a glowing lantern (IcosahedronGeometry core, additive glow layers, strong PointLight). Right hand holds a torch (thrust animation on tap). Responsive positioning based on camera FOV + aspect ratio for mobile support. All materials self-lit (MeshBasicMaterial).
  - `World.ts` — Three.js scene, camera (added to scene for hand children to render), FogExp2, fence-post path, flickering lantern light

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

## Workflow

- Only commit and push to GitHub after the user has tested and confirmed changes work
- Keep CLAUDE.md and README.md up to date with significant changes

## Performance Constraints

- Devvit Web apps must work well on mobile — test responsive behavior
- Camera must be added to scene (`scene.add(camera)`) for camera-child objects (hands) to render
- Keep draw calls low: share geometry/material instances, prefer `MeshBasicMaterial` for small/unlit elements and self-lit objects (hands), only use `transparent: true` on materials that actually need sub-1.0 opacity or additive blending
- Avoid per-frame `traverse()` — store direct references to materials/meshes that need animation
- Minimize `PointLight` count (each light multiplies fragment shader cost); creature flash lights are short-lived and cleaned up
- Dispose all Three.js geometries and materials when removing meshes from the scene to prevent memory leaks
- Responsive hand positioning: calculate from camera FOV + aspect ratio, not hardcoded pixel values
- The Vite build uses `@devvit/start/vite` plugin which handles the client/server split automatically
- Server entry compiles to `dist/server/index.cjs` (CommonJS)
- Three.js bundles are large — `chunkSizeWarningLimit` is set to 3000 in vite config
- Node.js ≥22.2.0 required
- Menu endpoints must return `UiResponse` type (e.g., `{ navigateTo: url }` or `{ showToast: msg }`), not plain JSON

## Key Technical Gotchas

- Never use `Object.assign` with `position: new THREE.Vector3()` on Three.js objects — it replaces the internal position property and breaks matrix updates. Always use `mesh.position.set(x, y, z)`.
- Raycaster needs `intersectObjects(targets, true)` (recursive) since creatures are Groups with child meshes. Walk the parent chain from the hit object to find the creature Group.
- Creatures need `material.colorWrite = false; material.depthWrite = false` on invisible hit-area meshes so they're raycastable but don't render.
