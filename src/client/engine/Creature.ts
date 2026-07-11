import * as THREE from 'three';
import type { ParticleSystem } from './effects/Particles';

export type MovementPattern = 'straight' | 'weave' | 'zigzag' | 'flank';

export interface CreatureConfig {
  speed: number;
  spawnZ: number;
  targetZ: number;
  spawnX?: number;
  pattern?: MovementPattern;
  fx?: ParticleSystem;
}

type CreatureState = 'approaching' | 'disintegrating' | 'fading';

const DISINTEGRATE_DURATION = 0.5;
const FADE_DURATION = 0.35;
const IMPACT_DURATION = 0.4;
const IMPACT_INTENSITY = 4;
const HIT_RADIUS = 0.5;
// Ghosts never cross the fence line (posts at x ±2; margin covers the
// ~0.5 half-width of the alien so even splayed tentacles stay inside)
const X_BOUND = 1.4;

// HDR particle colors (>1 blooms) — the alien glows violet, deliberately a
// different species of light from the pistol's teal
const GHOST_BURST_COLOR = new THREE.Color(0xcc99ff).multiplyScalar(2.0);
const GHOST_WISP_COLOR  = new THREE.Color(0x553388).multiplyScalar(1.0);

// ─── SHARED STATIC RESOURCES (never mutated, never disposed here) ─────
// Fully procedural alien entity: a floating octopus/jellyfish thing — a
// bulbous bell (lathe) with seven tapered tentacles hanging beneath it.
// Bell local space: y=0 at the opening lip, crown at y=0.75.
function makeBellGeo(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const seg = 20;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = t * 0.75;
    let r: number;
    if (t < 0.12)      r = 0.24 + 0.05 * (t / 0.12);                                  // lip flares out
    else if (t < 0.45) r = 0.29 + 0.05 * Math.sin(((t - 0.12) / 0.33) * Math.PI / 2); // bulge to 0.34
    else if (t < 0.85) r = 0.34 - 0.14 * ((t - 0.45) / 0.40);                         // taper upward
    else               r = 0.20 * Math.cos(((t - 0.85) / 0.15) * Math.PI / 2);        // rounded crown
    pts.push(new THREE.Vector2(Math.max(0.004, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 18);
  // Scallop the margin like a jellyfish bell: a 7-lobed ripple that is
  // strongest at the lip and dies out by mid-bell, so the silhouette reads
  // organic instead of machine-turned.
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const lipWeight = Math.max(0, 1 - y / 0.28);
    const scallop = 1 + Math.sin(Math.atan2(x, z) * 7) * 0.055 * lipWeight;
    pos.setX(i, x * scallop);
    pos.setZ(i, z * scallop);
  }
  geo.computeVertexNormals();
  return geo;
}

// Tapered tentacle hanging from its origin: thick at the bell lip, whip-thin
// at the tip, with a gentle S-curve baked in so it never reads as a straight
// pipe even before the shader sway. Height segments matter — the shader
// bends the shaft along them.
function makeTentacleGeo(): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(0.030, 0.004, 0.78, 6, 10);
  geo.translate(0, -0.39, 0);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = -y / 0.78; // 0 at root, 1 at tip
    pos.setX(i, pos.getX(i) + Math.sin(t * 4.5) * 0.05 * t);
    pos.setZ(i, pos.getZ(i) + Math.cos(t * 3.2) * 0.03 * t);
  }
  geo.computeVertexNormals();
  return geo;
}

const BELL_GEO = makeBellGeo();
const TENTACLE_GEO = makeTentacleGeo();
const CORE_GEO = new THREE.SphereGeometry(0.10, 8, 8);
const HIT_GEO = new THREE.SphereGeometry(HIT_RADIUS, 6, 6);

const HIT_MAT = new THREE.MeshBasicMaterial();
HIT_MAT.colorWrite = false;
HIT_MAT.depthWrite = false;

// Fresnel rim + vertex waver. NORMAL blending with a near-black body —
// additive made the alien a translucent wash against the pale fog; a solid
// dark silhouette with a teal rim is what actually pops out there. Fog is
// manual: the body color mixes toward World's haze color with the same
// FogExp2 curve (density must stay in sync with World, 0.06).
// Deliberately below World's 0.06: at gameplay depths (10–20 units) full
// fog washed the alien into a pale translucent-looking ghost. The lighter
// density keeps it a dark solid presence while still fading with distance.
const GHOST_FOG_DENSITY = 0.045;

const GHOST_MAT_TEMPLATE = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uDissolve: { value: 0 },
    uFogDensity: { value: GHOST_FOG_DENSITY },
    uFogColor: { value: new THREE.Color(0x3d4a68) },
    uBaseColor: { value: new THREE.Color(0x030408) },
    // violet bioluminescent rim — crosses the bloom threshold at glancing
    // angles; hue-jittered per instance in the constructor
    uRimColor: { value: new THREE.Color(0xb069ff) },
    // lateral undulation, weighted toward negative-y tips — 0 for the bell,
    // raised on the tentacle material clone so the shafts actually writhe
    uSway: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform float uSway;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying float vDepth;
    varying float vY;
    varying vec3 vPos;
    void main() {
      vec3 p = position + normal * sin(position.y * 6.0 + uTime * 3.0) * 0.03;
      // tentacle writhe: tips (most negative local y) sway hardest
      float swayF = clamp(-position.y * 1.4, 0.0, 1.0);
      swayF *= swayF;
      p.x += sin(uTime * 2.3 + position.y * 4.5) * uSway * swayF;
      p.z += cos(uTime * 1.7 + position.y * 3.5) * uSway * swayF;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(-mv.xyz);
      vDepth = -mv.z;
      vY = clamp(position.y / 1.6, 0.0, 1.0);
      vPos = position;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uOpacity;
    uniform float uDissolve;
    uniform float uFogDensity;
    uniform vec3 uFogColor;
    uniform vec3 uBaseColor;
    uniform vec3 uRimColor;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying float vDepth;
    varying float vY;
    varying vec3 vPos;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.5);
      vec3 col = uBaseColor + uRimColor * rim * 2.4;

      // bioluminescent freckles — sparse dot lattice over the skin, each
      // spot breathing on its own phase (deep-sea creature language)
      float freck = sin(vPos.x * 41.0 + 1.7) * sin(vPos.y * 37.0 + 0.3) * sin(vPos.z * 43.0 + 2.1);
      freck = smoothstep(0.78, 0.97, freck);
      float fPulse = 0.55 + 0.45 * sin(uTime * 2.2 + vPos.y * 9.0 + vPos.x * 5.0);
      col += uRimColor * freck * fPulse * 0.6;

      // faint radial muscle striations on the bell (fade out below the lip
      // and toward the crown so they don't stripe the tentacles)
      float bellBand = smoothstep(0.02, 0.15, vPos.y) * smoothstep(0.72, 0.45, vPos.y);
      float stripes = pow(0.5 + 0.5 * sin(atan(vPos.x, vPos.z) * 9.0), 6.0);
      col += uRimColor * stripes * bellBand * 0.10;

      // fade the silhouette into the haze exactly like FogExp2 would
      float fog = exp(-pow(uFogDensity * vDepth, 2.0));
      col = mix(uFogColor, col, fog);
      // dissolve eats the body from the tail upward
      float dissolve = clamp(1.0 - uDissolve * (0.6 + 0.9 * (1.0 - vY)), 0.0, 1.0);
      float alpha = uOpacity * dissolve;
      gl_FragColor = vec4(col, alpha);
    }
  `,
  blending: THREE.NormalBlending,
  // Opaque body: full alpha at rest, depthWrite on so bell/tentacles
  // self-occlude correctly. transparent stays true only so the dissolve
  // and reach-fade can still eat the alpha on death.
  transparent: true,
  depthWrite: true,
  side: THREE.DoubleSide,
});

export class Creature {
  readonly mesh: THREE.Group;
  private speed: number;
  private targetZ: number;
  private alive = true;
  private handled = false;
  private creatureState: CreatureState = 'approaching';
  private stateTimer = 0;
  private spawnTime = performance.now();
  private fx: ParticleSystem | null;

  private pattern: MovementPattern;
  private baseX: number;
  /** Weave center + amplitude, fitted inside X_BOUND in the constructor. */
  private weaveCenter = 0;
  private weaveAmplitude = 0.8 + Math.random() * 1.2;
  private weaveFreq = 1.5 + Math.random() * 1.5;
  private zigzagDir = 1;
  private zigzagTimer = 0;
  private zigzagInterval = 0.4 + Math.random() * 0.4;
  private flankTarget: number;

  // per-instance (animated/faded) resources — disposed in dispose()
  private ownedMaterials: THREE.Material[] = [];
  private fadeBaseOpacities: number[] = [];

  private ghostMat: THREE.ShaderMaterial;
  private tentacleMat: THREE.ShaderMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private bell: THREE.Mesh;
  private tentacles: THREE.Mesh[] = [];
  private tentaclePhases: number[] = [];
  /** Static outward splay per tentacle — sway in animate() adds on top. */
  private tentacleBaseRx: number[] = [];
  private tentacleBaseRz: number[] = [];
  private wispTimer = 0;
  private impactLight: THREE.PointLight | null = null;
  private impactGlow: THREE.Mesh | null = null;
  private impactTimer = 0;

  constructor(config: CreatureConfig) {
    this.speed = config.speed;
    this.targetZ = config.targetZ;
    this.fx = config.fx ?? null;
    this.mesh = new THREE.Group();
    this.pattern = config.pattern ?? 'straight';
    this.baseX = THREE.MathUtils.clamp(config.spawnX ?? (Math.random() - 0.5) * 3, -X_BOUND, X_BOUND);
    this.flankTarget = this.baseX > 0 ? -0.5 : 0.5;
    // shrink the weave to fit, then recenter it so the full sinusoid
    // stays inside the fence instead of clipping flat at the boundary
    this.weaveAmplitude = Math.min(this.weaveAmplitude, X_BOUND);
    this.weaveCenter = THREE.MathUtils.clamp(
      this.baseX,
      -(X_BOUND - this.weaveAmplitude),
      X_BOUND - this.weaveAmplitude
    );

    // ── body: bell + tentacles + inner core, fresnel material per part
    // group (cloning shares the compiled program; two clones so the
    // tentacles get a raised uSway while the bell stays becalmed)
    this.ghostMat = this.own(GHOST_MAT_TEMPLATE.clone());
    this.tentacleMat = this.own(GHOST_MAT_TEMPLATE.clone());
    this.tentacleMat.uniforms.uSway!.value = 0.09;

    // Bell floats with its lip at y=0.88, crown at y=1.63. Random spin so
    // the scalloped lobes and striations never line up across creatures.
    this.bell = new THREE.Mesh(BELL_GEO, this.ghostMat);
    this.bell.position.y = 0.88;
    this.bell.rotation.y = Math.random() * Math.PI * 2;
    this.mesh.add(this.bell);

    // Seven tentacles hanging from a ring just inside the bell lip,
    // varied in length and starting angle so they never read as a brush
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      const tentacle = new THREE.Mesh(TENTACLE_GEO, this.tentacleMat);
      tentacle.position.set(Math.cos(angle) * 0.16, 0.90, Math.sin(angle) * 0.16);
      tentacle.rotation.y = Math.random() * Math.PI * 2;
      // slight outward splay from the ring (reapplied under the sway)
      const baseRx = Math.sin(angle) * 0.14;
      const baseRz = -Math.cos(angle) * 0.14;
      tentacle.rotation.x = baseRx;
      tentacle.rotation.z = baseRz;
      tentacle.scale.y = 0.8 + Math.random() * 0.35;
      this.tentacles.push(tentacle);
      this.tentaclePhases.push(Math.random() * Math.PI * 2);
      this.tentacleBaseRx.push(baseRx);
      this.tentacleBaseRz.push(baseRz);
      this.mesh.add(tentacle);
    }

    // Glowing inner core, visible through the bell as a diffuse heart —
    // pulses in animate() in time with the bell's breathing
    this.coreMat = this.own(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xcc88ff).multiplyScalar(1.9),
        transparent: true,
        opacity: 0.30,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const core = new THREE.Mesh(CORE_GEO, this.coreMat);
    core.position.y = 1.12;
    this.mesh.add(core);

    // Per-instance hue jitter so the swarm doesn't read as one stamped
    // color — each alien sits a few degrees around the violet base.
    const hueJitter = (Math.random() - 0.5) * 0.05;
    (this.ghostMat.uniforms.uRimColor!.value as THREE.Color).offsetHSL(hueJitter, 0, 0);
    (this.tentacleMat.uniforms.uRimColor!.value as THREE.Color).offsetHSL(hueJitter, 0, 0);
    this.coreMat.color.offsetHSL(hueJitter, 0, 0);

    // Centered on the visual mass: bell 0.88–1.63, tentacles below
    const hit = new THREE.Mesh(HIT_GEO, HIT_MAT);
    hit.position.y = 0.95;
    this.mesh.add(hit);

    this.mesh.position.set(this.baseX, 0, config.spawnZ);
  }

  private own<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  /** World-space center of the hittable body (must match the hit mesh y). */
  getHitCenter(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.mesh.position).add(new THREE.Vector3(0, 0.95, 0));
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────
  /** Fireball hit: flash, burst into motes, dissolve. */
  disintegrate(): void {
    if (this.handled) return;
    this.handled = true;
    this.creatureState = 'disintegrating';
    this.stateTimer = 0;

    // impact flash — short-lived violet plasma light + blooming glow
    this.impactLight = new THREE.PointLight(0xbb88ff, IMPACT_INTENSITY, 1.4);
    this.impactLight.position.set(0, 0.9, 0.2);
    this.mesh.add(this.impactLight);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xd8b8ff).multiplyScalar(2.0),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    this.impactGlow = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 6), glowMat);
    this.impactGlow.position.set(0, 0.9, 0.05);
    this.mesh.add(this.impactGlow);
    this.impactTimer = IMPACT_DURATION;

    // dissolve into rising motes
    if (this.fx) {
      const p = this.mesh.position.clone();
      p.y += 1.0;
      this.fx.burst(p, 45, {
        color: GHOST_BURST_COLOR,
        velocity: new THREE.Vector3(0, 1.4, 0),
        spread: 2.6,
        gravity: 1.0,
        drag: 0.3,
        life: 0.6,
        lifeJitter: 0.5,
        size: 0.045,
        sizeJitter: 0.04,
      });
    }
  }

  reachPlayer(): void {
    if (this.handled) return;
    this.handled = true;
    this.creatureState = 'fading';
    this.stateTimer = 0;
    for (const mat of this.ownedMaterials) mat.transparent = true;
    this.fadeBaseOpacities = this.ownedMaterials.map((m) => m.opacity);
  }

  isApproaching(): boolean {
    return this.creatureState === 'approaching' && this.alive;
  }

  hasReachedTarget(): boolean {
    return this.mesh.position.z >= this.targetZ;
  }

  isAlive(): boolean {
    return this.alive;
  }

  wasHandled(): boolean {
    return this.handled;
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────
  update(delta: number): void {
    if (!this.alive) return;
    const t = (performance.now() - this.spawnTime) * 0.001;

    this.updateImpact(delta);
    this.ghostMat.uniforms.uTime!.value = t;
    this.tentacleMat.uniforms.uTime!.value = t;

    switch (this.creatureState) {
      case 'disintegrating':
        this.updateDisintegrating(delta);
        break;
      case 'fading':
        this.updateFading(delta);
        break;
      case 'approaching':
        this.mesh.position.z += this.speed * delta;
        this.applyMovementPattern(delta, t);
        this.animate(t, delta);
        break;
    }
  }

  private updateImpact(delta: number): void {
    if (!this.impactLight || this.impactTimer <= 0) return;
    this.impactTimer -= delta;
    const fade = Math.max(0, this.impactTimer / IMPACT_DURATION);
    this.impactLight.intensity = IMPACT_INTENSITY * fade;
    if (this.impactGlow) {
      (this.impactGlow.material as THREE.MeshBasicMaterial).opacity = 0.35 * fade;
    }
    if (this.impactTimer <= 0) this.cleanupImpact();
  }

  private cleanupImpact(): void {
    if (this.impactLight) {
      this.mesh.remove(this.impactLight);
      this.impactLight = null;
    }
    if (this.impactGlow) {
      this.mesh.remove(this.impactGlow);
      this.impactGlow.geometry.dispose();
      (this.impactGlow.material as THREE.Material).dispose();
      this.impactGlow = null;
    }
  }

  private updateDisintegrating(delta: number): void {
    this.stateTimer += delta;
    if (this.stateTimer > DISINTEGRATE_DURATION) {
      this.alive = false;
      return;
    }
    const p = this.stateTimer / DISINTEGRATE_DURATION;
    this.ghostMat.uniforms.uDissolve!.value = p;
    this.tentacleMat.uniforms.uDissolve!.value = p;
    // collapse toward the bell as the body dissolves
    const s = 1 - p * 0.45;
    this.mesh.scale.set(s, 1 - p * 0.2, s);
    this.coreMat.opacity *= (1 - p);
  }

  private updateFading(delta: number): void {
    this.stateTimer += delta;
    if (this.stateTimer > FADE_DURATION) {
      this.alive = false;
      return;
    }
    const fade = Math.max(0, 1 - this.stateTimer / FADE_DURATION);
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]!.opacity = (this.fadeBaseOpacities[i] ?? 1) * fade;
    }
    this.ghostMat.uniforms.uOpacity!.value = fade;
    this.tentacleMat.uniforms.uOpacity!.value = fade;
  }

  // ─── MOVEMENT ─────────────────────────────────────────────────────
  private applyMovementPattern(delta: number, t: number): void {
    switch (this.pattern) {
      case 'weave':
        this.mesh.position.x = this.weaveCenter + Math.sin(t * this.weaveFreq) * this.weaveAmplitude;
        break;
      case 'zigzag':
        this.zigzagTimer += delta;
        if (this.zigzagTimer >= this.zigzagInterval) {
          this.zigzagTimer = 0;
          this.zigzagDir *= -1;
        }
        this.mesh.position.x += this.zigzagDir * this.speed * 1.5 * delta;
        break;
      case 'flank': {
        const p = Math.min(1, t * 0.5);
        this.mesh.position.x = this.baseX + (this.flankTarget - this.baseX) * p;
        break;
      }
    }
    // hard boundary for every pattern (animate() also nudges x slightly)
    this.mesh.position.x = THREE.MathUtils.clamp(this.mesh.position.x, -X_BOUND, X_BOUND);
  }

  // ─── ANIMATION ────────────────────────────────────────────────────
  private animate(t: number, delta: number): void {
    // Floating hover with gentle bob (the shader waver does the rest)
    this.mesh.position.y = 0.15 + Math.sin(t * 1.8) * 0.12 + Math.sin(t * 0.7) * 0.06;
    this.mesh.position.x += Math.sin(t * 2.2) * 0.002;
    this.mesh.rotation.y = Math.sin(t * 1.0) * 0.08;

    // Bell breathes like a jellyfish propelling itself — widens as it
    // flattens, narrows as it stretches — with a slow ponderous tilt
    const breath = Math.sin(t * 2.6) * 0.05;
    this.bell.scale.set(1 + breath, 1 - breath * 0.8, 1 + breath);
    this.bell.rotation.z = Math.sin(t * 0.9) * 0.06;

    // Core glow pulses in time with the breathing
    this.coreMat.opacity = 0.28 + Math.sin(t * 2.6 + 0.6) * 0.12;

    // Tentacle roots sway out of phase (the shader writhes the shafts)
    for (let i = 0; i < this.tentacles.length; i++) {
      const tent = this.tentacles[i]!;
      const phase = this.tentaclePhases[i]!;
      tent.rotation.x = this.tentacleBaseRx[i]! + Math.sin(t * 1.6 + phase) * 0.18;
      tent.rotation.z = this.tentacleBaseRz[i]! + Math.cos(t * 1.3 + phase * 1.4) * 0.16;
    }

    // Trailing wisps shed from around the tentacle tips
    if (this.fx) {
      this.wispTimer -= delta;
      if (this.wispTimer <= 0) {
        this.wispTimer = 0.1 + Math.random() * 0.12;
        const p = this.mesh.position.clone();
        p.x += (Math.random() - 0.5) * 0.3;
        p.y += 0.15 + Math.random() * 0.35;
        this.fx.spawn(p, {
          color: GHOST_WISP_COLOR,
          velocity: new THREE.Vector3(0, 0.35, 0.2),
          spread: 0.35,
          drag: 0.4,
          life: 0.5,
          lifeJitter: 0.35,
          size: 0.04,
          sizeJitter: 0.03,
        });
      }
    }
  }

  // ─── CLEANUP ──────────────────────────────────────────────────────
  dispose(): void {
    this.cleanupImpact();
    // geometry is shared statics — only materials are ours
    for (const mat of this.ownedMaterials) mat.dispose();
    this.ownedMaterials.length = 0;
  }
}
