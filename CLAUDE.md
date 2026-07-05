# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nightwatch is a first-person Three.js game built for Reddit's Devvit Web platform for the "Games with a Hook" hackathon. It runs as an interactive post inside Reddit feeds. The player holds a lantern in the left hand and conjures fireballs in the right. Ghosts drift out of the dark toward the player; every tap hurls a fireball toward that point. Hits build an unbroken streak — any miss resets it. The core hook is accuracy under pressure: spamming fireballs is punished.

## Gameplay

- **60-second timed sessions** with escalating difficulty
- **Ghosts** (red eyes, translucent, floating, trailing wisps) use movement patterns (straight/weave/zigzag/flank) that get trickier as time passes
- **Tap anywhere** to throw a fireball toward the tap point (aim assist: if the tap ray crosses a ghost, the fireball aims at that exact point — but the ghost can drift out of its path in flight)
- **Fireball hits a ghost** → ghost dissolves (score +1, streak +1)
- **Fireball misses** (flies past, hits the ground, burns out) → streak resets, counts as a miss
- **Ghost reaching the player** → miss, streak resets, speed penalty
- Consecutive ghost-reaches make ghosts approach faster; a hit resets the speed to base

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
  - `GameManager.ts` — game loop, fireball throwing (tap → raycast for aim point → spawn projectile), per-frame sphere collision between fireballs and ghosts, scoring/streak, spawn timing, state transitions. Render loop runs from construction (scene visible behind ready/end overlays). Owns the shared `fx` ParticleSystem and injects it into creatures and fireballs.
  - `PostFX.ts` — EffectComposer + UnrealBloomPass + OutputPass. Selective bloom via HDR color boosting: emissive materials multiply their color above 1.0 and the bloom threshold is 1.0, so only eyes/flames/moon/ghost-rims bloom. Custom HalfFloat MSAA render target (WebGL2); falls back to direct rendering on WebGL1 (`postfx.enabled === false`). ACES tone mapping is set on the renderer in World.
  - `Creature.ts` — the ghost, built on Kenney's `character-ghost.glb` (three rigid meshes: torso, arm-left, arm-right; no skinning, so `clone(true)` shares geometry). Per-creature: ONE cloned MeshStandardMaterial (shared by all three meshes) made translucent (opacity 0.85) with faint emissive self-glow (`emissiveMap = map`) so it reads inside the fog. Procedural animation re-targets the named arm nodes for ethereal sway; group-level hover bob. Wisp particle trail, additive aura, movement patterns (straight/weave/zigzag/flank), state machine (approaching→disintegrating/fading), invisible hit sphere for tap-time aim assist, `getHitCenter()` for projectile collision. Dies by scale-collapse + opacity fade + fx burst with a short-lived orange impact PointLight. `dispose()` disposes only owned materials — geometry belongs to the shared template.
  - `assets.ts` — GLTFLoader pipeline for Kenney Graveyard Kit models (CC0, `src/client/assets/*.glb`, ~200 KB total). Loaded once behind the ready screen; `GameManager.spawnCreature()` no-ops until loaded, and `World.installKitProps()` swaps procedural gravestones for kit models + crypts when ready. GLBs are imported with Vite `?url` (needs `vite-env.d.ts`).
  - `Fireball.ts` — thrown projectile: HDR-boosted core + additive glow (bloom does the fire halo, no PointLight), ember trail + hit/fizzle bursts through the shared fx system, straight-line flight along the aim ray. Expires past z −24, below ground, or after 1.8s. All resources are shared statics; nothing to dispose per instance.
  - `Hands.ts` — first-person hands attached to the camera. Left hand holds a caged lantern (crystal core, cage bars/rings, shader flame). Right hand cradles a conjured fire orb (HDR core + shader flame cone + embers); `throwFireball()` plays the thrust animation and the orb scales to zero and regrows over ~0.35s. Figure-8 idle sway. Responsive positioning based on camera FOV + aspect ratio for mobile support.
  - `World.ts` — Three.js scene, camera (added to scene for hand children to render), FogExp2, ACES tone mapping, PostFX integration (render + resize), canvas-textured ground/path, merged decrepit fence (posts + rails, one draw call), flickering lantern light
  - `effects/Particles.ts` — pooled `ParticleSystem`: one THREE.Points, one draw call, additive soft-dot shader with manual FogExp2 fade, swap-with-last compaction. Instances: `fx` (world, 300, owned by GameManager) and torch embers (40, owned by Hands).
  - `environment/Sky.ts` — gradient dome (BackSide ShaderMaterial), ~200 twinkling star Points (vertex-shader animated), moon with procedural canvas maria. All `fog: false`.
  - `environment/Props.ts` — dead trees (recursive branching merged into one geometry, black silhouette MeshBasicMaterial), gravestones (merged), drifting additive mist planes, occluding smoke clouds (normal alpha blending + renderOrder 3 so they genuinely hide ghosts drifting behind them — a difficulty mechanic, not just decoration), firefly Points (fully vertex-shader animated), plus exported CanvasTexture makers for ground/path.

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
- Minimize `PointLight` count (each light multiplies fragment shader cost). Budget: 3 persistent (world lantern, hands lantern, held fire orb) + short-lived ghost impact lights. Creatures and fireballs must NOT carry persistent PointLights — bloom-boosted glow materials do that job.
- Shared static geometry/materials rule: module-level shared resources are **never mutated and never disposed by instances**; anything whose opacity/color animates must be a per-instance clone tracked and disposed by its owner. Cloned ShaderMaterials share the compiled program, so cloning is cheap.
- Bloom is half-CSS-resolution and DPR-independent: `composer.setSize` multiplies by pixelRatio internally, so `bloomPass.setSize(cssW, cssH)` must be re-called *after* it (composer.setSize overwrites pass sizes)
- Particle effects go through the pooled `ParticleSystem` (one draw call per system) — never one mesh per particle
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
- Additive materials must never enable `depthWrite`, and custom ShaderMaterials get no scene fog — the particle shader implements FogExp2 manually as a fade-to-black (`exp(-pow(density * viewDepth, 2))`); the density constant must stay in sync with World's fog (0.06).
- Custom ShaderMaterials bypass per-material tone mapping/color space — author output in linear and let OutputPass convert the composed frame; do not include `colorspace_fragment`.
- Sky/moon/star materials need `fog: false` or FogExp2 erases them at 50+ units.
- `npm run lint` currently fails on Windows for two pre-existing reasons: the glob is single-quoted in package.json (cmd passes quotes literally) and `eslint.config.js` imports `@eslint/js` which is not in devDependencies.
