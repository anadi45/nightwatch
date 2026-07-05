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
  - `GameManager.ts` — game loop, raycasting for tap-on-creature input, scoring, spawn timing, state transitions. Render loop runs from construction (scene visible behind ready/end overlays). Owns the shared `fx` ParticleSystem and injects it into creatures.
  - `PostFX.ts` — EffectComposer + UnrealBloomPass + OutputPass. Selective bloom via HDR color boosting: emissive materials multiply their color above 1.0 and the bloom threshold is 1.0, so only eyes/flames/moon/ghost-rims bloom. Custom HalfFloat MSAA render target (WebGL2); falls back to direct rendering on WebGL1 (`postfx.enabled === false`). ACES tone mapping is set on the renderer in World.
  - `Creature.ts` — two creature types built from Three.js primitives:
    - **Human** (survivor): jointed capsule rig — thigh/shin and shoulder/elbow pivot groups for a knee-bending run cycle, hooded cloak (cone hood + lathe cape) with warm emissive, carried candle with warm gold glow (the "friendly" marker), blue bloom-boosted eyes
    - **Ghost** (threat): custom fresnel-rim ShaderMaterial (spectral green edge glow, vertex waver, per-instance `uTime`/`uOpacity`/`uDissolve` uniforms), fog done manually in-shader as fade-to-black, wisp particle trail, additive aura, red flickering bloom-boosted eyes. Dies by dissolving into rising particles (`uDissolve` + fx burst), not chunk scatter.
    - Shared: movement patterns (straight/weave/zigzag/flank), state machine (approaching→disintegrating/fading), invisible hit sphere for forgiving tap targets, torch flash effect (short-lived PointLight burst on tap). Geometries and never-mutated materials are module-level statics shared across all creatures; anything animated (shader clones, eye materials) is a per-instance clone tracked in `ownedMaterials` and disposed in `dispose()`. **No per-creature PointLights** — bloom halos replace them.
  - `Hands.ts` — first-person hands attached to the camera. Left hand holds a caged lantern (crystal core, cage bars/rings, shader flame). Right hand holds a torch with a shader-driven flame cone (vertex wag scaled by uv.y, white-hot base that blooms) and a rising-ember ParticleSystem parented to the torch group so embers follow the thrust. Figure-8 idle sway. Responsive positioning based on camera FOV + aspect ratio for mobile support.
  - `World.ts` — Three.js scene, camera (added to scene for hand children to render), FogExp2, ACES tone mapping, PostFX integration (render + resize), canvas-textured ground/path, merged decrepit fence (posts + rails, one draw call), flickering lantern light
  - `effects/Particles.ts` — pooled `ParticleSystem`: one THREE.Points, one draw call, additive soft-dot shader with manual FogExp2 fade, swap-with-last compaction. Instances: `fx` (world, 300, owned by GameManager) and torch embers (40, owned by Hands).
  - `environment/Sky.ts` — gradient dome (BackSide ShaderMaterial), ~200 twinkling star Points (vertex-shader animated), moon with procedural canvas maria. All `fog: false`.
  - `environment/Props.ts` — dead trees (recursive branching merged into one geometry, black silhouette MeshBasicMaterial), gravestones (merged), drifting additive mist planes, firefly Points (fully vertex-shader animated), plus exported CanvasTexture makers for ground/path.

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
- Minimize `PointLight` count (each light multiplies fragment shader cost). Budget: 3 persistent (world lantern, hands lantern, torch) + short-lived creature flash lights. Creatures must NOT carry their own PointLights — bloom-boosted glow materials do that job.
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
- Additive materials must never enable `depthWrite`, and custom ShaderMaterials get no scene fog — the ghost/particle shaders implement FogExp2 manually as a fade-to-black (`exp(-pow(density * viewDepth, 2))`); the density constant must stay in sync with World's fog (0.06).
- Custom ShaderMaterials bypass per-material tone mapping/color space — author output in linear and let OutputPass convert the composed frame; do not include `colorspace_fragment`.
- Sky/moon/star materials need `fog: false` or FogExp2 erases them at 50+ units.
- `npm run lint` currently fails on Windows for two pre-existing reasons: the glob is single-quoted in package.json (cmd passes quotes literally) and `eslint.config.js` imports `@eslint/js` which is not in devDependencies.
