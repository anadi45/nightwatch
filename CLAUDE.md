# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nightwatch is a first-person alien-shooter Three.js game built for Reddit's Devvit Web platform for the "Games with a Hook" hackathon. It runs as an interactive post inside Reddit feeds. The player wields a two-handed alien energy pistol. Alien entities glide out of the dark toward the player; every tap fires a bolt toward that point. Hits build an unbroken streak — any miss resets it. The core hook is accuracy under pressure: spamming shots is punished.

## Art Direction — Silhouette Horror (Limbo/Inside) with alien bioluminescence

Every visual decision obeys one rule: **the scene is layered near-black paper-cut silhouettes against a luminous moonlit sky; the aliens' teal glow and the pistol's energy elements are the only bright things.** Concretely:

- Distance fog fades toward **pale haze** (0x3d4a68), never black — that's what separates the cutout layers. Sky horizon 0x3d4a68 → mid 0x1a2440 → zenith 0x0a0e22 (3-stop gradient).
- Environment objects (trees, crystal shards, fence, rocks, grass) use unlit near-black `MeshBasicMaterial` (`SILHOUETTE_MAT`, 0x05060c) — silhouettes don't take light. Everything is procedural; there are no model assets.
- Light sources: cool moonlight directional from the moon position (8,13,-44) at intensity 1.0, ambient 0x2a3a5a @ 0.55, a dim forward fill directional (0x3a4d6a @ 0.3) so gameplay is readable, a warm lantern-pool PointLight near the player (2.2, range 20), and the pistol's teal energy/muzzle lights (kept dim/short-range so gloves don't tint green). The ground has a baked emissive moonlight pool.
- Aliens self-glow **teal** (0x00ddaa rim, fresnel shader) with teal almond eyes; the pistol's vents/muzzle share the same teal language. The world lantern pool is the only warm element.
- New props = new black cutout shapes. Do not add colored/lit/textured environment objects.

## Gameplay

- **60-second timed sessions** with escalating difficulty
- **Aliens** (floating octopus-like entity: bulbous breathing bell, seven writhing tentacles, teal fresnel rim, teal almond eyes, glowing inner core, trailing wisps) use movement patterns (straight/weave/zigzag/flank) that get trickier as time passes, always staying inside the fence line (`X_BOUND`)
- **Tap anywhere** to fire an energy bolt toward the tap point (aim assist: if the tap ray crosses an alien, the bolt aims at that exact point — but the alien can drift out of its path in flight)
- **Bolt hits an alien** → alien dissolves (score +1, streak +1)
- **Bolt misses** (flies past, hits the ground, burns out) → streak resets, counts as a miss
- **Alien reaching the player** → miss, streak resets, speed penalty
- Consecutive alien-reaches make aliens approach faster; a hit resets the speed to base
- **Streaks carry across watches**: a run starts from the player's server-stored `currentStreak` and writes its end-of-run streak back; only a miss resets it. Logged-out players get no carry.
- **Two watches per day** per logged-in player, server-enforced (UTC day, counter key with 48h expiry). Starting a run consumes a play even if abandoned. Logged-out players are uncapped (casual, no persistence).

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
  - `splash.html` (inline, default) — title screen shown in Reddit feed: tagline + player standing chips (carried streak / best / rank / watches left, fetched fail-soft from `/api/init`) + Play button
  - `game.html` — full Three.js game scene with CSS loader, opened when user clicks Play
  - Splash→Game navigation uses `requestExpandedMode(event, 'game')` from `@devvit/web/client`

- **`src/client/engine/`** — Game engine modules:
  - `GameManager.ts` — game loop, bolt firing (tap → raycast for aim point → spawn projectile; class is still named `Fireball`), per-frame sphere collision between bolts and aliens, scoring/streak, spawn timing, state transitions. Render loop runs from construction (scene visible behind ready/end overlays). Owns the shared `fx` ParticleSystem and injects it into creatures and fireballs.
  - `PostFX.ts` — EffectComposer + UnrealBloomPass + film ShaderPass (vignette to ~45% corners, animated grain damped in bright areas, slight cool grade — runs on the linear HDR buffer before OutputPass) + OutputPass. Selective bloom via HDR color boosting: emissive materials multiply their color above 1.0 and the bloom threshold is 1.0, so only eyes/energy-vents/muzzle/moon/alien-rims bloom. Custom HalfFloat MSAA render target (WebGL2); falls back to direct rendering on WebGL1 (`postfx.enabled === false`). ACES tone mapping is set on the renderer in World.
  - `Creature.ts` — the alien, **fully procedural, no model asset**: floating octopus — bulbous bell lathe with a 7-lobed scalloped lip (displaced post-lathe + `computeVertexNormals`; lip y 0.88, crown 1.63, breathing scale pulse + random y-spin per instance in `animate()`/constructor) + seven tapered-cylinder tentacles with a baked S-curve hanging from a ring inside the lip (length-jittered, static outward splay stored in `tentacleBaseRx/Rz` arrays and reapplied under the per-frame root sway) + teal HDR inner core sphere pulsing with the breath. The fragment shader adds pulsing bioluminescent freckles (sin-product dot lattice) and faint radial striations masked to the bell band. No aura shell — the rim/freckles do the glow. Two per-instance clones of the fresnel ShaderMaterial (**normal blending, near-black body + teal 0x00ddaa rim**; manual fog mixes toward haze 0x3d4a68 at World's density 0.06; `uDissolve` eats tail-up on death) — bell clone has `uSway` 0, tentacle clone 0.09 (shader writhes shafts, weighted to the tips via negative local y); both clones need every uniform update (uTime/uDissolve/uOpacity). Almond eyes: 3 meshes per eye (void-black shell + teal HDR iris + additive glow), all sphere geo flattened via mesh scale; iris/glow opacity pulses in `animate()` (eyeMats layout is [void, iris, glow] × 2 — indices matter). Wisp trail, movement patterns fitted inside `X_BOUND` (weave recentered, hard clamp for all), state machine, hit sphere, `getHitCenter()`. Dies by dissolve + scale-collapse + teal fx burst + short-lived teal impact PointLight. `dispose()` disposes only owned materials — geometry is module-level shared statics.
  - `Fireball.ts` — the fired energy bolt (class name predates the pistol): elongated white-hot HDR core inside a teal additive sheath + halo, all stretched along the flight axis (group quaternion from the aim ray; bloom does the glow, no PointLight). Trail through the shared fx system: tracer afterimages hanging on the flight line (reads as a beam from behind) + a twin ion helix coiling around the path + occasional white flecks; hit = white flash + expanding teal spark shell + rising ion motes, miss = dim teal fizzle. Grows out of the muzzle over the first 0.07s. Speed 26 u/s, slim profile (core r 0.034) — a plasma round, not a fireball. Expires past z −24, below ground, or after 1.2s. All resources are shared statics; nothing to dispose per instance.
  - `Hands.ts` — first-person two-handed alien energy pistol attached to the camera. Procedural gun: dark metal frame/slide/grip/trigger-guard (MeshStandardMaterial), teal HDR-boosted energy vents + core window + muzzle ring (bloom, no per-vent lights). Both hands grip it (same finger/palm/arm builders, **dark leather gloves** — bare skin glowed green under the teal lights): right fist on the handle, left bracing under the barrel. The whole assembly is scaled 0.55 (and arms a further 0.6) so the pistol reads as a handgun in frame, not a screen-filling prop. `throwFireball()` triggers a 0.30s recoil kick + 0.09s teal-white muzzle-flash PointLight + additive glow decay. A persistent breathing teal PointLight sits at the frame (replaces the old warm orb light in the light budget).
  - `World.ts` — Three.js scene, camera (added to scene for hand children to render), pale-haze FogExp2 (see Art Direction), ACES tone mapping, PostFX integration (render + resize), near-black ground with baked emissive moonlight pool + moonlit path strip (path texture doubles as color map and emissiveMap; transparent for feathered edges), merged silhouette fence (one draw call), moonlight DirectionalLight from the moon position (8,13,-44) @ 1.0, ambient 0.55, forward fill directional 0.3, flickering warm lantern light near the player (2.2, range 20)
  - `effects/Particles.ts` — pooled `ParticleSystem`: one THREE.Points, one draw call, additive soft-dot shader with manual FogExp2 fade, swap-with-last compaction. One instance: `fx` (world, 300, owned by GameManager, injected into creatures and bolts).
  - `environment/Sky.ts` — 3-stop gradient dome (horizon 0x3d4a68 → mid 0x1a2440 → zenith 0x0a0e22, BackSide ShaderMaterial), ~200 small dim twinkling star Points (vertex-shader animated, cool #c8d8f4 tint), moon upper-right at (8,13,-44) with radial-gradient disc (#f2f6ff → #8ca8d0) + one smooth canvas-gradient halo sprite (layered flat discs band visibly), two hand-colored hill ridge layers (ShapeGeometry paper-cut silhouettes, farther = lighter). All `fog: false`.
  - `environment/Props.ts` — dead trees (recursive branching merged into one geometry), crystal-shard clusters placed from a `crystalSpots` array (one tall faceted spike + smaller leaning shards per spot), patch-clustered grass with wind sway injected via `onBeforeCompile` (displacement ∝ height², `frustumCulled = false` since tips exceed static bounds) + rocks (each scatter one merged geometry) — all silhouette cutouts (grass has its own material for the wind uniform, rest share `SILHOUETTE_MAT`); drifting additive mist planes, occluding smoke clouds (normal alpha blending + renderOrder 3 so they genuinely hide aliens drifting behind them — a difficulty mechanic, not just decoration), teal spore-mote Points (fully vertex-shader animated, same color language as the alien rims), plus exported CanvasTexture makers for the ground's emissive moonlight pool (not tiled, maps 1:1) and the path (alpha-feathered ragged edges — its material needs `transparent: true`).

- **`src/server/`** — Hono app (`index.ts`) mounting routes:
  - `/api/*` (`routes/api.ts`) — `/init` (identity + stats, rendered on the splash card), `/run/start` (POST — reserves a daily play, returns the carry streak + a `runId` idempotency token), `/score` (POST, validated; deduped by `runId` via atomic `incrBy` on `done:{username}:{runId}` — the client fires a keepalive copy on `pagehide` so closing the game mid-run still records the standing), `/leaderboard`. **Identity always comes from `reddit.getCurrentUsername()` via Devvit's request context — never from client-sent params.** Score submissions are shape-checked in the route (integer caps) and carry-consistency-checked in `submitScore` (zero misses ⇒ `endStreak === carryIn + score` exactly; any miss ⇒ `endStreak ≤ score`; `bestStreak` between the two) — the server validates against the carry *it* handed out at `/run/start`.
  - `/internal/menu/*` — subreddit menu actions (e.g., "Create Nightwatch Post")
  - `/internal/form/*` — Devvit form handlers
  - `/internal/triggers/*` — app lifecycle events (install, etc.)
  - `core/post.ts` — creates Reddit custom posts via `reddit.submitCustomPost()`
  - `core/leaderboard.ts` — Redis data layer. Keys: `lb:alltime` (zset, member=username, score=best run — guarded by `zScore` so only improvements write), `player:{username}` (hash of lifetime stats incl. `currentStreak`, the carry), `plays:{username}:{utc-date}` (daily play counter, 48h expiry, `incrBy` is the reservation). Descending rank = `zCard − zRank`.

- **`src/shared/api.ts`** — Request/response contracts shared between client and server (requests carry no identity by design)

- **`src/client/api.ts`** — typed fetch wrappers for `/api/*`; all fail soft to null so the end screen never blocks on the network (logged-out players 401 on `/score` and still see the board)

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
- Minimize `PointLight` count (each light multiplies fragment shader cost). Budget: 2 persistent (world lantern pool, pistol energy light) + short-lived muzzle flash and alien impact lights. Creatures and bolts must NOT carry persistent PointLights — bloom-boosted glow materials do that job.
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
