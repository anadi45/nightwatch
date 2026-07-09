# Nightwatch

A dark, atmospheric first-person Three.js game that runs directly inside Reddit feeds as an interactive post. Built on [Devvit Web](https://developers.reddit.com) — Reddit's developer platform.

## Hackathon

This project is an entry for Reddit's [**Games with a Hook**](https://redditgameswithahook.devpost.com/) hackathon (June 17 – July 15, 2026), organized by Reddit.

## The Game

You are the night watchman — and tonight, something not of this world has taken the fields. Crystal growths split the earth beneath the dead trees, and alien entities glide out of the dark on unpredictable paths — weaving, zigzagging, flanking from the sides — their teal bioluminescence the only warning you get.

Your weapon is an alien energy pistol. **Tap anywhere to fire** a bolt toward that point. Hit an alien and it dissolves in a burst of light — your streak climbs. Miss, and your streak shatters. Let one reach you and things get worse — they speed up.

As the 60-second watch progresses, spawn rates increase and alien movement gets trickier. Every shot counts: spraying bolts into the dark is the fastest way to lose your streak.

One pistol. One watch. How long can you keep the streak alive?

## Tech Stack

| Layer | Technology |
|-------|------------|
| Game Engine | [Three.js](https://threejs.org) |
| Language | TypeScript |
| Bundler | Vite |
| Server | Hono |
| Platform | Devvit Web (Reddit) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22.2.0 or higher
- A Reddit account with access to [Devvit](https://developers.reddit.com)

### Setup

```bash
git clone https://github.com/anadi45/nightwatch.git
cd nightwatch
npm install
npm run login    # Authenticate with Reddit
```

### Development

```bash
npm run dev
```

This launches a Devvit playtest session — your game runs live on Reddit and hot-reloads as you edit.

### Build & Deploy

```bash
npm run build        # Build client + server to dist/
npm run type-check   # TypeScript checks
npm run lint         # ESLint
npm run deploy       # Type-check + lint + upload to Devvit
npm run launch       # Deploy + publish to production
```

## Project Structure

```
nightwatch/
├── src/
│   ├── client/                 # Frontend — runs in the Reddit post
│   │   ├── splash.*            # Title screen (inline in feed)
│   │   ├── game.*              # Three.js game scene + HUD + loader
│   │   └── engine/
│   │       ├── GameManager.ts  # Game loop, bolt firing/collision, scoring
│   │       ├── Creature.ts     # Alien entity (procedural), movement patterns, dissolve
│   │       ├── Fireball.ts     # Plasma bolt projectile with ion-helix trail
│   │       ├── Hands.ts        # First-person two-handed energy pistol
│   │       ├── World.ts        # Scene, camera, lighting, environment
│   │       ├── PostFX.ts       # Bloom post-processing (selective via HDR colors)
│   │       ├── effects/        # Pooled particle system
│   │       └── environment/    # Night sky, moon, stars, trees, crystals, mist
│   ├── server/                 # Backend — runs on Devvit servers
│   │   ├── index.ts            # Hono app, mounts all routes
│   │   ├── core/               # Server utilities
│   │   └── routes/             # API, menu actions, forms, triggers
│   └── shared/
│       └── api.ts              # TypeScript types shared across client & server
├── devvit.json                 # Devvit app configuration
├── vite.config.ts              # Vite + Devvit build plugin
└── tsconfig.json               # TypeScript configuration
```

## How It Works

Nightwatch runs as a Devvit Web interactive post with two entrypoints:

1. **Splash screen** — Rendered inline in the Reddit feed. Shows the game title and a Play button.
2. **Game scene** — Full Three.js 3D scene in first person. Opens when the user clicks Play.

The player grips a two-handed alien energy pistol in first-person view. Alien entities approach along a dark, foggy path — flanked by crystal growths — as near-black silhouettes rimmed in teal bioluminescence, with glowing almond eyes and trailing wisps, using unpredictable movement patterns — weaving, zigzagging, or flanking from the sides.

Tap to fire an energy bolt toward that point. It flies straight, so a weaving alien can drift out of its path — lead your shots. A hit dissolves the alien in a burst of teal light and builds your streak; a miss (or an alien reaching you) breaks it. The challenge escalates: aliens that reach you make the rest faster, spawn intervals tighten, and movement patterns become trickier.

The client communicates with the Devvit server via API routes (`/api/*`). The server handles game state persistence, menu actions for moderators, and app lifecycle events.

## Contributing

Contributions are welcome! This is an open-source project — feel free to open issues, suggest features, or submit pull requests.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature
npm run type-check && npm run lint   # Make sure everything passes
git commit -m "Add your feature"
git push origin feature/your-feature
# Open a pull request
```

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Devvit playtest (live dev on Reddit) |
| `npm run build` | Build client and server to `dist/` |
| `npm run type-check` | Run TypeScript compiler checks |
| `npm run lint` | Lint source files with ESLint |
| `npm run prettier` | Format source files with Prettier |
| `npm run deploy` | Type-check, lint, and upload to Devvit |
| `npm run launch` | Deploy and publish to production |
| `npm run login` | Authenticate CLI with Reddit |

## Credits

- All visuals — the alien entity, energy pistol, and environment — are fully procedural. No external model assets are used.

## License

[BSD-3-Clause](LICENSE)
