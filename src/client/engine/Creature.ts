import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { ParticleSystem } from './effects/Particles';

export type MovementPattern = 'straight' | 'weave' | 'zigzag' | 'flank';

export interface CreatureConfig {
  /** Normalized rigged ghost template (Quaternius) — cloned per creature. */
  model: THREE.Group;
  animations: THREE.AnimationClip[];
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
const GHOST_HEIGHT = 1.5; // template is normalized to height 1
const IDLE_CLIP = 'CharacterArmature|Flying_Idle';

// HDR particle colors (>1 blooms)
const GHOST_BURST_COLOR = new THREE.Color(0x99ffdd).multiplyScalar(1.8);
const GHOST_WISP_COLOR = new THREE.Color(0x557788).multiplyScalar(0.9);

// ─── SHARED STATIC RESOURCES (never mutated, never disposed here) ─────
const GHOST_AURA_GEO = new THREE.SphereGeometry(0.35, 8, 8);
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

  // per-instance (animated/faded) resources — disposed in dispose()
  private ownedMaterials: THREE.Material[] = [];
  private fadeBaseOpacities: number[] = [];

  private bodyMat: THREE.MeshStandardMaterial | null = null;
  private eyeMats: THREE.MeshBasicMaterial[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private modelRoot: THREE.Group;
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

    // SkeletonUtils.clone keeps the skinned mesh bound to its own cloned
    // bones; geometry stays shared with the template.
    this.modelRoot = cloneSkeleton(config.model) as THREE.Group;
    this.modelRoot.scale.setScalar(GHOST_HEIGHT);
    const matCache = new Map<THREE.Material, THREE.Material>();
    this.modelRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.frustumCulled = false; // skinned bounds are bind-pose only
      const src = child.material as THREE.Material;
      let mat = matCache.get(src);
      if (!mat) {
        if (src.name === 'Eye_White') {
          // sclera becomes the glowing red bloom halo
          const eye = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true });
          eye.color.multiplyScalar(2.4);
          this.eyeMats.push(eye);
          mat = eye;
        } else if (src.name === 'Eye_Black') {
          mat = new THREE.MeshBasicMaterial({ color: 0x1a0505, transparent: true });
        } else {
          const body = (src as THREE.MeshStandardMaterial).clone();
          body.transparent = true;
          body.opacity = 0.8;
          // faint self-glow so the ghost reads inside the fog before
          // the lantern light reaches it
          body.emissive.setHex(0x8899bb);
          body.emissiveIntensity = 0.35;
          this.bodyMat = body;
          mat = body;
        }
        this.ownedMaterials.push(mat);
        matCache.set(src, mat);
      }
      child.material = mat;
    });
    this.mesh.add(this.modelRoot);

    // baked flying idle, desynced per creature
    this.mixer = new THREE.AnimationMixer(this.modelRoot);
    const clip = THREE.AnimationClip.findByName(config.animations, IDLE_CLIP);
    if (clip) {
      const action = this.mixer.clipAction(clip);
      action.play();
      action.time = Math.random() * clip.duration;
      this.mixer.timeScale = 0.9 + Math.random() * 0.3;
    }

    // Additive glow aura (shared material — hidden on death, never faded)
    this.aura = new THREE.Mesh(GHOST_AURA_GEO, AURA_MAT);
    this.aura.position.y = 0.75;
    this.aura.scale.setScalar(2);
    this.mesh.add(this.aura);

    const hit = new THREE.Mesh(HIT_GEO, HIT_MAT);
    hit.position.y = 0.85;
    this.mesh.add(hit);

    this.mesh.position.set(this.baseX, 0, config.spawnZ);
  }

  /** World-space center of the hittable body. */
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
    if (this.bodyMat) this.bodyMat.emissiveIntensity = 1.2; // flash-bright

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

    switch (this.creatureState) {
      case 'disintegrating':
        this.updateDisintegrating(delta);
        break;
      case 'fading':
        this.updateFading(delta);
        break;
      case 'approaching':
        this.mixer?.update(delta);
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
    // collapse and fade as the motes take over
    const s = 1 - p * 0.5;
    this.mesh.scale.set(s, 1 - p * 0.25, s);
    if (this.bodyMat) {
      this.bodyMat.opacity = 0.85 * (1 - p);
      this.bodyMat.emissiveIntensity = 1.2 * (1 - p * 0.7);
    }
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
    // Gentle group hover on top of the baked Flying_Idle (kept small so
    // the two don't fight)
    this.mesh.position.y = 0.1 + Math.sin(t * 1.8) * 0.07 + Math.sin(t * 0.7) * 0.04;
    this.mesh.position.x += Math.sin(t * 2.2) * 0.002;
    this.mesh.rotation.y = Math.sin(t * 1.0) * 0.08;
    this.mesh.rotation.z = Math.sin(t * 1.4) * 0.04;

    // Flickering red eyes
    const flicker = Math.random() > 0.94 ? 0.2 : 1.0;
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
    // geometry belongs to the shared template — only materials are ours
    for (const mat of this.ownedMaterials) mat.dispose();
    this.ownedMaterials.length = 0;
  }
}
