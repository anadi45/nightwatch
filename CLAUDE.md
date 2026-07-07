# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nightwatch is a first-person Three.js game built for Reddit's Devvit Web platform for the "Games with a Hook" hackathon. It runs as an interactive post inside Reddit feeds. The player holds a lantern in the left hand and conjures fireballs in the right. Ghosts drift out of the dark toward the player; every tap hurls a fireball toward that point. Hits build an unbroken streak — any miss resets it. The core hook is accuracy under pressure: spamming fireballs is punished.

## Art Direction — Silhouette Horror (Limbo/Inside)

Every visual decision obeys one rule: **the scene is layered near-black paper-cut silhouettes against a luminous moonlit sky; ghosts and fire are the only glowing things.** Concretely:

- Distance fog fades toward **pale haze** (0x3d4a68), never black — that's what separates the cutout layers. Sky horizon band 0x5a6f9a, zenith 0x0a0e22.
- Environment objects (trees, stones, kit models, fence, rocks, mounds, grass) use unlit near-black `MeshBasicMaterial` (`SILHOUETTE_MAT`, 0x05060c) — silhouettes don't take light. Kenney kit meshes get this material overridden at install time; that's what unifies their cartoony style with the scene.
- Light sources: cool moonlight directional (backlight from the moon position — rims ghosts/hands, fronts stay dark), a small warm lantern pool near the player, fireball/impact lights. The ground has a baked emissive moonlight pool; it is NOT lit into visibility.
- Ghosts self-glow cold white-blue (strong emissive) with red bloom eyes; fire is the only warm element.
- New props = new black cutout shapes. Do not add colored/lit/textured environment objects.

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
  - `PostFX.ts` — EffectComposer + UnrealBloomPass + film ShaderPass (vignette to ~45% corners, animated grain damped in bright areas, slight cool grade — runs on the linear HDR buffer before OutputPass) + OutputPass. Selective bloom via HDR color boosting: emissive materials multiply their color above 1.0 and the bloom threshold is 1.0, so only eyes/flames/moon/ghost-rims bloom. Custom HalfFloat MSAA render target (WebGL2); falls back to direct rendering on WebGL1 (`postfx.enabled === false`). ACES tone mapping is set on the renderer in World.
  - `Creature.ts` — the ghost, built on Quaternius' rigged ghost (`ghost.glb`, CC0): full armature with finger/tail bones, cloned per creature via `SkeletonUtils.clone` (geometry shared). Plays the baked `CharacterArmature|Flying_Idle` clip through an AnimationMixer, desynced per creature (random start time + timeScale). Materials by name: `Ghost_Main` → per-instance translucent clone with faint emissive; `Eye_White` → HDR-boosted red MeshBasicMaterial (the bloom halo + flicker); `Eye_Black` → dark pupils. Skinned meshes need `frustumCulled = false` (bind-pose bounds only). Wisp trail, additive aura, movement patterns, state machine, hit sphere, `getHitCenter()`. Dies by scale-collapse + opacity fade + fx burst + short-lived orange impact PointLight. `dispose()` disposes only owned materials.
  - `assets.ts` — GLTFLoader pipeline (`src/client/assets/*.glb`, ~310 KB total): Quaternius ghost (with animations) + Kenney gravestones/crypt/lantern. `normalize()` wraps loaded scenes so they're height 1 with feet at origin — consumers scale in world units. Loaded once behind the ready screen; `spawnCreature()` no-ops until loaded; `World.installKitProps()` and `Hands.installLantern()` swap procedural stand-ins when ready. GLBs imported with Vite `?url` (needs `vite-env.d.ts`).
  - `Fireball.ts` — thrown projectile: HDR-boosted core + additive glow (bloom does the fire halo, no PointLight), ember trail + hit/fizzle bursts through the shared fx system, straight-line flight along the aim ray. Expires past z −24, below ground, or after 1.8s. All resources are shared statics; nothing to dispose per instance.
  - `Hands.ts` — first-person arms attached to the camera, built as real hands: sleeve + forearm + flattened-capsule palm + four two-segment fingers + thumb (shared MeshStandardMaterial skin, lit by the lantern/orb PointLights for actual shading). Hand local space: wrist at origin, fingers +Y, palm normal +Z; positive knuckle rotation.x curls toward the palm. Left = fist gripping a handle with the Kenney lantern swinging below on a pendulum sway (placeholder glow until `installLantern()`); right = palm-up cup holding the fire orb. Two-layer shader flames (outer orange + inner white-hot core that blooms). `throwFireball()` plays the thrust and the orb regrows over ~0.35s.
  - `World.ts` — Three.js scene, camera (added to scene for hand children to render), pale-haze FogExp2 (see Art Direction), ACES tone mapping, PostFX integration (render + resize), near-black ground with baked emissive moonlight pool + moonlit path strip (path texture doubles as color map and emissiveMap; transparent for feathered edges), merged silhouette fence (one draw call), cool moonlight DirectionalLight backlight from the moon position, flickering warm lantern light near the player
  - `effects/Particles.ts` — pooled `ParticleSystem`: one THREE.Points, one draw call, additive soft-dot shader with manual FogExp2 fade, swap-with-last compaction. Instances: `fx` (world, 300, owned by GameManager) and torch embers (40, owned by Hands).
  - `environment/Sky.ts` — gradient dome with a bright horizon band hugging the skyline (BackSide ShaderMaterial), ~200 twinkling star Points (vertex-shader animated), large low moon with procedural canvas maria + wide additive halo, two hand-colored hill ridge layers (ShapeGeometry paper-cut silhouettes, farther = lighter). All `fog: false`.
  - `environment/Props.ts` — dead trees (recursive branching merged into one geometry), gravestones placed from a shared `stoneSpots` array (used by procedural stand-ins, kit models, and the dirt mounds in front of each stone so they stay aligned), grass tufts + rocks (each scatter one merged geometry) — all silhouette cutouts sharing `SILHOUETTE_MAT`; drifting additive mist planes, occluding smoke clouds (normal alpha blending + renderOrder 3 so they genuinely hide ghosts drifting behind them — a difficulty mechanic, not just decoration), firefly Points (fully vertex-shader animated), plus exported CanvasTexture makers for the ground's emissive moonlight pool (not tiled, maps 1:1) and the path (alpha-feathered ragged edges — its material needs `transparent: true`).

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
