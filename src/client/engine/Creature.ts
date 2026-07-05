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

const GHOST_EYE = 0xff2200;
const GHOST_GLOW = 0xff1100;

// HDR particle colors (>1 blooms)
const GHOST_BURST_COLOR = new THREE.Color(0x99ffdd).multiplyScalar(1.8);
const GHOST_WISP_COLOR = new THREE.Color(0x557788).multiplyScalar(0.9);

// ─── SHARED STATIC RESOURCES ──────────────────────────────────────────
// Never mutated and never disposed by creatures. Anything animated
// (shader clones, eye materials) is a per-instance clone tracked in
// ownedMaterials.

function makeGhostBodyGeo(): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const seg = 12;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const y = t * 1.6;
    let r: number;
    if (t < 0.15) r = 0.2 * Math.sqrt(t / 0.15);
    else if (t < 0.4) r = 0.2 - (t - 0.15) * 0.15;
    else if (t < 0.7) r = 0.16 + (Math.sin(((t - 0.4) * Math.PI) / 0.3) * 0.04);
    else r = 0.2 * (1 - (t - 0.7) / 0.3);
    pts.push(new THREE.Vector2(Math.max(0.01, r), y));
  }
  return new THREE.LatheGeometry(pts, 10);
}

const GHOST_BODY_GEO = makeGhostBodyGeo();
const GHOST_HEAD_GEO = new THREE.SphereGeometry(0.16, 10, 8);
const GHOST_ARM_GEO = new THREE.CylinderGeometry(0.025, 0.008, 0.4, 5);
const GHOST_TENDRIL_GEO = new THREE.PlaneGeometry(0.06, 0.3, 1, 3);
const GHOST_AURA_GEO = new THREE.SphereGeometry(0.35, 8, 8);
const EYE_GEO = new THREE.SphereGeometry(0.02, 4, 4);
const EYE_GLOW_GEO = new THREE.SphereGeometry(0.05, 4, 4);
const HIT_GEO = new THREE.SphereGeometry(HIT_RADIUS, 6, 6);

const AURA_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x334466).multiplyScalar(1.4),
  transparent: true,
  opacity: 0.06,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
});

const HIT_MAT = new THREE.MeshBasicMaterial();
HIT_MAT.colorWrite = false;
HIT_MAT.depthWrite = false;

// Fresnel rim + vertex waver. Additive, so fog is done manually as a
// fade-to-black matching World's FogExp2 (density must stay in sync).
const GHOST_FOG_DENSITY = 0.06;

const GHOST_MAT_TEMPLATE = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uDissolve: { value: 0 },
    uFogDensity: { value: GHOST_FOG_DENSITY },
    uBaseColor: { value: new THREE.Color(0x445566) },
    // spectral green rim — reads "supernatural" against the warm lantern
    uRimColor: { value: new THREE.Color(0x88ffcc) },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying float vDepth;
    varying float vY;
    void main() {
      vec3 p = position + normal * sin(position.y * 6.0 + uTime * 3.0) * 0.03;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(-mv.xyz);
      vDepth = -mv.z;
      vY = clamp(position.y / 1.6, 0.0, 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    uniform float uDissolve;
    uniform float uFogDensity;
    uniform vec3 uBaseColor;
    uniform vec3 uRimColor;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying float vDepth;
    varying float vY;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), 2.5);
      vec3 col = uBaseColor * 0.25 + uRimColor * rim * 2.0;
      float fog = exp(-pow(uFogDensity * vDepth, 2.0));
      // dissolve eats the body from the tail upward
      float dissolve = clamp(1.0 - uDissolve * (0.6 + 0.9 * (1.0 - vY)), 0.0, 1.0);
      float alpha = uOpacity * fog * dissolve * 0.55;
      gl_FragColor = vec4(col, alpha);
    }
  `,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
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
  private weaveAmplitude = 0.8 + Math.random() * 1.2;
  private weaveFreq = 1.5 + Math.random() * 1.5;
  private zigzagDir = 1;
  private zigzagTimer = 0;
  private zigzagInterval = 0.4 + Math.random() * 0.4;
  private flankTarget: number;

  // per-instance (animated) resources — disposed in dispose()
  private ownedMaterials: THREE.Material[] = [];
  private fadeBaseOpacities: number[] = [];

  private ghostMat: THREE.ShaderMaterial;
  private eyeMats: THREE.MeshBasicMaterial[] = [];
  private arms: THREE.Mesh[] = [];
  private head: THREE.Mesh;
  private ragPanels: THREE.Mesh[] = [];
  private aura: THREE.Mesh;
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
    this.baseX = config.spawnX ?? (Math.random() - 0.5) * 3;
    this.flankTarget = this.baseX > 0 ? -0.5 : 0.5;

    this.ghostMat = this.own(GHOST_MAT_TEMPLATE.clone());

    const body = new THREE.Mesh(GHOST_BODY_GEO, this.ghostMat);
    this.mesh.add(body);

    this.head = new THREE.Mesh(GHOST_HEAD_GEO, this.ghostMat);
    this.head.position.y = 1.45;
    this.mesh.add(this.head);

    // Trailing wisp arms (reaching outward)
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(GHOST_ARM_GEO, this.ghostMat);
      arm.position.set(sx * 0.2, 1.1, 0.08);
      arm.rotation.x = -0.6;
      arm.rotation.z = sx * 0.4;
      this.arms.push(arm);
      this.mesh.add(arm);
    }

    // Wispy tail tendrils
    for (let i = 0; i < 3; i++) {
      const tendril = new THREE.Mesh(GHOST_TENDRIL_GEO, this.ghostMat);
      const angle = (i / 3) * Math.PI * 2;
      tendril.position.set(Math.cos(angle) * 0.08, 0.15, Math.sin(angle) * 0.08);
      tendril.rotation.y = angle;
      this.ragPanels.push(tendril);
      this.mesh.add(tendril);
    }

    // Additive glow aura (shared material — hidden on death, never faded)
    this.aura = new THREE.Mesh(GHOST_AURA_GEO, AURA_MAT);
    this.aura.position.y = 1.0;
    this.mesh.add(this.aura);

    this.addEyes();

    const hit = new THREE.Mesh(HIT_GEO, HIT_MAT);
    hit.position.y = 0.85;
    this.mesh.add(hit);

    this.mesh.position.set(this.baseX, 0, config.spawnZ);
  }

  private own<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private addEyes(): void {
    for (const sx of [-1, 1]) {
      const eyeMat = this.own(
        new THREE.MeshBasicMaterial({ color: GHOST_EYE, transparent: true, opacity: 0.95 })
      );
      // HDR boost above 1.0 so the red eyes cross the bloom threshold
      eyeMat.color.multiplyScalar(2.5);
      this.eyeMats.push(eyeMat);
      const eye = new THREE.Mesh(EYE_GEO, eyeMat);
      eye.position.set(sx * 0.055, 1.48, 0.1);
      this.mesh.add(eye);

      const glowMat = this.own(
        new THREE.MeshBasicMaterial({
          color: GHOST_GLOW,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
        })
      );
      this.eyeMats.push(glowMat);
      const glow = new THREE.Mesh(EYE_GLOW_GEO, glowMat);
      glow.position.set(sx * 0.055, 1.48, 0.1);
      this.mesh.add(glow);
    }
  }

  /** World-space center of the tappable/hittable body. */
  getHitCenter(target: THREE.Vector3): THREE.Vector3 {
    return target.copy(this.mesh.position).add(new THREE.Vector3(0, 0.85, 0));
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────
  /** Fireball hit: flash, burst into motes, dissolve. */
  disintegrate(): void {
    if (this.handled) return;
    this.handled = true;
    this.creatureState = 'disintegrating';
    this.stateTimer = 0;
    this.aura.visible = false;

    // impact flash — short-lived orange light + blooming glow
    this.impactLight = new THREE.PointLight(0xffaa44, IMPACT_INTENSITY, 1.4);
    this.impactLight.position.set(0, 0.9, 0.2);
    this.mesh.add(this.impactLight);
    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffcc66).multiplyScalar(2.0),
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
    this.aura.visible = false;
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
    // collapse toward the head as the body dissolves
    const s = 1 - p * 0.45;
    this.mesh.scale.set(s, 1 - p * 0.2, s);
    for (const mat of this.eyeMats) mat.opacity = Math.min(mat.opacity, 1 - p);
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
  }

  // ─── MOVEMENT ─────────────────────────────────────────────────────
  private applyMovementPattern(delta: number, t: number): void {
    switch (this.pattern) {
      case 'weave':
        this.mesh.position.x = this.baseX + Math.sin(t * this.weaveFreq) * this.weaveAmplitude;
        break;
      case 'zigzag':
        this.zigzagTimer += delta;
        if (this.zigzagTimer >= this.zigzagInterval) {
          this.zigzagTimer = 0;
          this.zigzagDir *= -1;
        }
        this.mesh.position.x += this.zigzagDir * this.speed * 1.5 * delta;
        this.mesh.position.x = Math.max(-3, Math.min(3, this.mesh.position.x));
        break;
      case 'flank': {
        const p = Math.min(1, t * 0.5);
        this.mesh.position.x = this.baseX + (this.flankTarget - this.baseX) * p;
        break;
      }
    }
  }

  // ─── ANIMATION ────────────────────────────────────────────────────
  private animate(t: number, delta: number): void {
    // Floating hover with gentle bob
    this.mesh.position.y = 0.15 + Math.sin(t * 1.8) * 0.12 + Math.sin(t * 0.7) * 0.06;
    this.mesh.position.x += Math.sin(t * 2.2) * 0.002;
    this.mesh.rotation.y = Math.sin(t * 1.0) * 0.08;

    // Arms sway ethereally
    if (this.arms[0]) {
      this.arms[0].rotation.z = 0.4 + Math.sin(t * 1.3) * 0.15;
      this.arms[0].rotation.x = -0.6 + Math.sin(t * 1.8) * 0.1;
    }
    if (this.arms[1]) {
      this.arms[1].rotation.z = -0.4 - Math.sin(t * 1.3 + 0.7) * 0.15;
      this.arms[1].rotation.x = -0.6 + Math.sin(t * 1.8 + 0.7) * 0.1;
    }

    // Head tilts slowly
    this.head.rotation.z = Math.sin(t * 0.9) * 0.12;

    // Tail tendrils sway
    for (let i = 0; i < this.ragPanels.length; i++) {
      this.ragPanels[i]!.rotation.x = Math.sin(t * 1.5 + i * 1.1) * 0.25;
      this.ragPanels[i]!.rotation.z = Math.cos(t * 1.2 + i * 0.8) * 0.1;
    }

    // Flickering red eyes
    const flicker = Math.random() > 0.94 ? 0.15 : 1.0;
    for (const mat of this.eyeMats) {
      mat.opacity = (0.85 + Math.sin(t * 5) * 0.1) * flicker;
    }

    // Trailing wisps shed from the tail
    if (this.fx) {
      this.wispTimer -= delta;
      if (this.wispTimer <= 0) {
        this.wispTimer = 0.1 + Math.random() * 0.12;
        const p = this.mesh.position.clone();
        p.x += (Math.random() - 0.5) * 0.25;
        p.y += 0.25 + Math.random() * 0.3;
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
    for (const mat of this.ownedMaterials) mat.dispose();
    this.ownedMaterials.length = 0;
  }
}
