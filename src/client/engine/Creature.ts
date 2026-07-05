import * as THREE from 'three';
import type { ParticleSystem } from './effects/Particles';

export type CreatureType = 'human' | 'ghost';
export type MovementPattern = 'straight' | 'weave' | 'zigzag' | 'flank';

export interface CreatureConfig {
  type: CreatureType;
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
const FLASH_DURATION = 0.4;
const FLASH_INTENSITY = 4;
const HIT_RADIUS = 0.5;

const HUMAN_EYE = 0x44ddff;
const HUMAN_GLOW = 0x22aacc;

const GHOST_EYE = 0xff2200;
const GHOST_GLOW = 0xff1100;

// HDR particle colors (>1 blooms)
const GHOST_BURST_COLOR = new THREE.Color(0x99ffdd).multiplyScalar(1.8);
const GHOST_WISP_COLOR = new THREE.Color(0x557788).multiplyScalar(0.9);
const VANISH_MOTE_COLOR = new THREE.Color(0xffe0a0).multiplyScalar(1.5);

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

// Human: jointed capsule build. Limb geometries are translated so the
// origin sits at the joint — parent pivot groups rotate to bend knees
// and elbows. The top cap pokes past the origin, reading as a joint.
function jointCapsule(radius: number, length: number): THREE.CapsuleGeometry {
  const geo = new THREE.CapsuleGeometry(radius, length, 4, 8);
  geo.translate(0, -length / 2, 0);
  return geo;
}

const HUMAN_TORSO_GEO = new THREE.CapsuleGeometry(0.13, 0.26, 4, 8);
const HUMAN_HEAD_GEO = new THREE.SphereGeometry(0.105, 8, 6);
const HUMAN_HOOD_GEO = new THREE.ConeGeometry(0.16, 0.28, 8, 1, true);
const HUMAN_CAPE_GEO = new THREE.LatheGeometry(
  [new THREE.Vector2(0.16, 0), new THREE.Vector2(0.21, -0.3), new THREE.Vector2(0.26, -0.6)],
  6,
  Math.PI / 2,
  Math.PI
);
const THIGH_GEO = jointCapsule(0.04, 0.24);
const SHIN_GEO = jointCapsule(0.032, 0.24);
const UPPER_ARM_GEO = jointCapsule(0.032, 0.18);
const FOREARM_GEO = jointCapsule(0.028, 0.16);
const CANDLE_GEO = new THREE.CylinderGeometry(0.02, 0.024, 0.08, 6);
const CANDLE_FLAME_GEO = new THREE.SphereGeometry(0.018, 5, 5);
const CANDLE_GLOW_GEO = new THREE.SphereGeometry(0.09, 6, 6);

// material templates — cloned per creature (fade-out mutates opacity)
const HUMAN_SKIN_TEMPLATE = new THREE.MeshStandardMaterial({ color: 0xc4956a, roughness: 0.8 });
const HUMAN_CLOAK_TEMPLATE = new THREE.MeshStandardMaterial({
  color: 0x6b5030,
  roughness: 0.9,
  emissive: 0x201408,
  emissiveIntensity: 0.6,
  side: THREE.DoubleSide,
});
const HUMAN_PANTS_TEMPLATE = new THREE.MeshStandardMaterial({ color: 0x4a3f35, roughness: 0.9 });
// candle flame boosted >1 — the warm gold bloom is the "friendly" marker
const CANDLE_FLAME_COLOR = new THREE.Color(0xffcc66).multiplyScalar(2.0);

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
    // spectral green rim — reads "supernatural" instantly and can't be
    // confused with the human's blue eye glow at distance
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
  readonly type: CreatureType;
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
  private ownedGeometries: THREE.BufferGeometry[] = [];
  private fadeBaseOpacities: number[] = [];

  private ghostMat: THREE.ShaderMaterial | null = null;
  private eyeMats: THREE.MeshBasicMaterial[] = [];
  private arms: THREE.Mesh[] = [];
  private head: THREE.Mesh | null = null;
  private ragPanels: THREE.Mesh[] = [];
  // human rig
  private torsoGroup: THREE.Group | null = null;
  private headGroup: THREE.Group | null = null;
  private thighPivots: THREE.Group[] = [];
  private shinPivots: THREE.Group[] = [];
  private shoulderPivots: THREE.Group[] = [];
  private candleGlowMat: THREE.MeshBasicMaterial | null = null;
  private aura: THREE.Mesh | null = null;
  private wispTimer = 0;
  private flashLight: THREE.PointLight | null = null;
  private flashGlow: THREE.Mesh | null = null;
  private flashBeam: THREE.Mesh | null = null;
  private flashTimer = 0;

  constructor(config: CreatureConfig) {
    this.type = config.type;
    this.speed = config.speed;
    this.targetZ = config.targetZ;
    this.fx = config.fx ?? null;
    this.mesh = new THREE.Group();
    this.pattern = config.pattern ?? 'straight';
    this.baseX = config.spawnX ?? (Math.random() - 0.5) * 3;
    this.flankTarget = this.baseX > 0 ? -0.5 : 0.5;

    if (this.type === 'human') this.buildHuman();
    else this.buildGhost();
    this.addHitArea();

    this.mesh.position.set(this.baseX, 0, config.spawnZ);
  }

  private own<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private ownGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  // ─── BUILD HUMAN (hooded survivor running toward player) ──────────
  private buildHuman(): void {
    const skin = this.own(HUMAN_SKIN_TEMPLATE.clone());
    const cloak = this.own(HUMAN_CLOAK_TEMPLATE.clone());
    const pants = this.own(HUMAN_PANTS_TEMPLATE.clone());

    // Legs: thigh pivot at the hip, shin pivot at the knee
    for (const sx of [-1, 1]) {
      const thighPivot = new THREE.Group();
      thighPivot.position.set(sx * 0.075, 0.62, 0);
      thighPivot.add(new THREE.Mesh(THIGH_GEO, pants));

      const shinPivot = new THREE.Group();
      shinPivot.position.set(0, -0.28, 0);
      shinPivot.add(new THREE.Mesh(SHIN_GEO, pants));
      thighPivot.add(shinPivot);

      this.thighPivots.push(thighPivot);
      this.shinPivots.push(shinPivot);
      this.mesh.add(thighPivot);
    }

    // Torso group leans forward — everything above the hips lives here
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.set(0, 0.62, 0);
    this.torsoGroup.rotation.x = 0.15;
    this.mesh.add(this.torsoGroup);

    const torso = new THREE.Mesh(HUMAN_TORSO_GEO, cloak);
    torso.position.y = 0.4;
    this.torsoGroup.add(torso);

    const cape = new THREE.Mesh(HUMAN_CAPE_GEO, cloak);
    cape.position.y = 0.56;
    this.torsoGroup.add(cape);

    // Arms: shoulder pivot, elbow pivot
    for (const sx of [-1, 1]) {
      const shoulderPivot = new THREE.Group();
      shoulderPivot.position.set(sx * 0.16, 0.56, 0);
      shoulderPivot.add(new THREE.Mesh(UPPER_ARM_GEO, cloak));

      const elbowPivot = new THREE.Group();
      elbowPivot.position.set(0, -0.21, 0);
      elbowPivot.add(new THREE.Mesh(FOREARM_GEO, skin));
      shoulderPivot.add(elbowPivot);

      if (sx < 0) {
        // left arm holds the candle up and forward
        shoulderPivot.rotation.x = -0.55;
        elbowPivot.rotation.x = -0.9;
      }
      this.shoulderPivots.push(shoulderPivot);
      this.torsoGroup.add(shoulderPivot);
    }

    // Head + hood
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.78, 0.03);
    this.torsoGroup.add(this.headGroup);

    const headMesh = new THREE.Mesh(HUMAN_HEAD_GEO, skin);
    this.headGroup.add(headMesh);

    const hood = new THREE.Mesh(HUMAN_HOOD_GEO, cloak);
    hood.position.set(0, 0.07, -0.02);
    hood.rotation.x = -0.12;
    this.headGroup.add(hood);

    // Carried candle — warm gold glow marks the survivor as friendly
    const candleGroup = new THREE.Group();
    candleGroup.position.set(-0.15, 0.4, 0.2);
    const candle = new THREE.Mesh(
      CANDLE_GEO,
      this.own(new THREE.MeshBasicMaterial({ color: 0xd8cfa8 }))
    );
    candleGroup.add(candle);
    const flame = new THREE.Mesh(
      CANDLE_FLAME_GEO,
      this.own(new THREE.MeshBasicMaterial({ color: CANDLE_FLAME_COLOR, transparent: true }))
    );
    flame.position.y = 0.06;
    candleGroup.add(flame);
    this.candleGlowMat = this.own(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffbb55).multiplyScalar(1.3),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
      })
    );
    const candleGlow = new THREE.Mesh(CANDLE_GLOW_GEO, this.candleGlowMat);
    candleGlow.position.y = 0.06;
    candleGroup.add(candleGlow);
    this.torsoGroup.add(candleGroup);

    this.addEyes(this.headGroup, HUMAN_EYE, HUMAN_GLOW, 0, 0.042, 0.11);
  }

  // ─── BUILD GHOST (translucent floating specter) ───────────────────
  private buildGhost(): void {
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

    // Additive glow aura (shared material — hidden, never faded)
    this.aura = new THREE.Mesh(GHOST_AURA_GEO, AURA_MAT);
    this.aura.position.y = 1.0;
    this.mesh.add(this.aura);

    this.addEyes(this.mesh, GHOST_EYE, GHOST_GLOW, 1.48, 0.055, 0.1);
  }

  // ─── SHARED BUILD HELPERS ─────────────────────────────────────────
  private addEyes(
    parent: THREE.Object3D,
    color: number,
    glowColor: number,
    y: number,
    spacing: number,
    z: number
  ): void {
    for (const sx of [-1, 1]) {
      const eyeMat = this.own(
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      // HDR boost above 1.0 so eyes cross the bloom threshold — the
      // blue-vs-red halo is the core identification mechanic at distance
      eyeMat.color.multiplyScalar(2.5);
      this.eyeMats.push(eyeMat);
      const eye = new THREE.Mesh(EYE_GEO, eyeMat);
      eye.position.set(sx * spacing, y, z);
      parent.add(eye);

      const glowMat = this.own(
        new THREE.MeshBasicMaterial({
          color: glowColor,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
        })
      );
      this.eyeMats.push(glowMat);
      const glow = new THREE.Mesh(EYE_GLOW_GEO, glowMat);
      glow.position.set(sx * spacing, y, z);
      parent.add(glow);
    }
  }

  private addHitArea(): void {
    const hit = new THREE.Mesh(HIT_GEO, HIT_MAT);
    hit.position.y = 0.85;
    this.mesh.add(hit);
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────
  flashTorch(): void {
    if (this.flashLight) return;

    // Short-range light to illuminate the creature's own meshes only
    this.flashLight = new THREE.PointLight(0xffdd55, FLASH_INTENSITY, 1.2);
    this.flashLight.position.set(0, 0.9, 0.2);
    this.mesh.add(this.flashLight);

    // Visible flashlight beam cone from player direction (+Z) toward creature body
    const beamGeo = new THREE.ConeGeometry(0.35, 2.0, 6, 1, true);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    beamMat.color.multiplyScalar(1.6); // beam catches a little bloom
    this.flashBeam = new THREE.Mesh(beamGeo, beamMat);
    this.flashBeam.position.set(0, 0.9, 1.0);
    this.mesh.add(this.flashBeam);

    // Impact glow where the beam hits the creature body
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffee88,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    glowMat.color.multiplyScalar(2.0); // impact pop blooms hard
    this.flashGlow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 6), glowMat);
    this.flashGlow.position.set(0, 0.9, 0.05);
    this.mesh.add(this.flashGlow);

    this.flashTimer = FLASH_DURATION;
  }

  disintegrate(): void {
    if (this.handled) return;
    this.handled = true;
    this.flashTorch();
    this.beginDisintegrate();
  }

  peacefulVanish(): void {
    if (this.handled) return;
    this.handled = true;
    this.beginFade();
    // gentle warm motes drift upward — they made it to safety
    if (this.fx) {
      const p = this.mesh.position.clone();
      p.y += 0.9;
      this.fx.burst(p, 12, {
        color: VANISH_MOTE_COLOR,
        velocity: new THREE.Vector3(0, 0.6, 0),
        spread: 0.5,
        gravity: 0.4,
        drag: 0.5,
        life: 0.7,
        lifeJitter: 0.5,
        size: 0.035,
        sizeJitter: 0.03,
      });
    }
  }

  reachPlayer(): void {
    if (this.handled) return;
    this.handled = true;
    this.beginFade();
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

  // ─── STATE TRANSITIONS ────────────────────────────────────────────
  private beginDisintegrate(): void {
    this.creatureState = 'disintegrating';
    this.stateTimer = 0;
    if (this.aura) this.aura.visible = false;

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

  private beginFade(): void {
    this.creatureState = 'fading';
    this.stateTimer = 0;
    if (this.aura) this.aura.visible = false;
    for (const mat of this.ownedMaterials) mat.transparent = true;
    this.fadeBaseOpacities = this.ownedMaterials.map((m) => m.opacity);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────
  update(delta: number): void {
    if (!this.alive) return;
    const t = (performance.now() - this.spawnTime) * 0.001;

    this.updateFlash(delta);
    if (this.ghostMat) this.ghostMat.uniforms.uTime!.value = t;

    switch (this.creatureState) {
      case 'disintegrating':
        if (this.updateDisintegrating(delta)) return;
        break;
      case 'fading':
        if (this.updateFading(delta)) return;
        break;
      case 'approaching':
        this.mesh.position.z += this.speed * delta;
        this.applyMovementPattern(delta, t);
        if (this.type === 'human') this.animateHuman(t);
        else this.animateGhost(t, delta);
        break;
    }
  }

  private updateFlash(delta: number): void {
    if (!this.flashLight || this.flashTimer <= 0) return;
    this.flashTimer -= delta;
    const fade = Math.max(0, this.flashTimer / FLASH_DURATION);
    this.flashLight.intensity = FLASH_INTENSITY * fade;
    if (this.flashGlow) {
      (this.flashGlow.material as THREE.MeshBasicMaterial).opacity = 0.3 * fade;
    }
    if (this.flashBeam) {
      (this.flashBeam.material as THREE.MeshBasicMaterial).opacity = 0.1 * fade;
    }
    if (this.flashTimer <= 0) this.cleanupFlash();
  }

  private cleanupFlash(): void {
    if (this.flashLight) {
      this.mesh.remove(this.flashLight);
      this.flashLight = null;
    }
    for (const obj of [this.flashGlow, this.flashBeam]) {
      if (obj) {
        this.mesh.remove(obj);
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
    this.flashGlow = null;
    this.flashBeam = null;
  }

  private updateDisintegrating(delta: number): boolean {
    this.stateTimer += delta;
    if (this.stateTimer > DISINTEGRATE_DURATION) {
      this.alive = false;
      return true;
    }
    const p = this.stateTimer / DISINTEGRATE_DURATION;
    if (this.ghostMat) this.ghostMat.uniforms.uDissolve!.value = p;
    // collapse toward the head as the body dissolves
    const s = 1 - p * 0.45;
    this.mesh.scale.set(s, 1 - p * 0.2, s);
    for (const mat of this.eyeMats) mat.opacity = Math.min(mat.opacity, 1 - p);
    return true;
  }

  private updateFading(delta: number): boolean {
    this.stateTimer += delta;
    if (this.stateTimer > FADE_DURATION) {
      this.alive = false;
      return true;
    }
    const fade = Math.max(0, 1 - this.stateTimer / FADE_DURATION);
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]!.opacity = (this.fadeBaseOpacities[i] ?? 1) * fade;
    }
    if (this.ghostMat) this.ghostMat.uniforms.uOpacity!.value = fade;
    return true;
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

  // ─── ANIMATIONS ───────────────────────────────────────────────────
  private animateHuman(t: number): void {
    // Running gait: thighs swing, knees bend only on the back-swing,
    // free arm counter-swings, candle arm stays raised
    const phase = t * 8;
    const stride = Math.sin(phase);
    this.mesh.position.y = Math.abs(stride) * 0.05;

    if (this.thighPivots[0]) this.thighPivots[0].rotation.x = -stride * 0.55;
    if (this.thighPivots[1]) this.thighPivots[1].rotation.x = stride * 0.55;
    if (this.shinPivots[0]) {
      this.shinPivots[0].rotation.x = Math.max(0, Math.sin(phase + 0.6)) * 0.85;
    }
    if (this.shinPivots[1]) {
      this.shinPivots[1].rotation.x = Math.max(0, Math.sin(phase + Math.PI + 0.6)) * 0.85;
    }
    // left arm (index 0) carries the candle — only a slight sway
    if (this.shoulderPivots[0]) this.shoulderPivots[0].rotation.x = -0.55 + stride * 0.1;
    if (this.shoulderPivots[1]) this.shoulderPivots[1].rotation.x = -stride * 0.5;

    if (this.torsoGroup) this.torsoGroup.rotation.z = Math.sin(phase * 0.5) * 0.04;
    if (this.headGroup) this.headGroup.rotation.y = Math.sin(t * 4) * 0.06;
    if (this.candleGlowMat) {
      this.candleGlowMat.opacity = 0.3 + Math.sin(t * 11) * 0.08 + Math.random() * 0.05;
    }
  }

  private animateGhost(t: number, delta: number): void {
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
    if (this.head) this.head.rotation.z = Math.sin(t * 0.9) * 0.12;

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
    this.cleanupFlash();
    for (const geo of this.ownedGeometries) geo.dispose();
    for (const mat of this.ownedMaterials) mat.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
  }
}
