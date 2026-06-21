import * as THREE from 'three';

export type CreatureType = 'human' | 'ghost';
export type MovementPattern = 'straight' | 'weave' | 'zigzag' | 'flank';

export interface CreatureConfig {
  type: CreatureType;
  speed: number;
  spawnZ: number;
  targetZ: number;
  spawnX?: number;
  pattern?: MovementPattern;
}

type CreatureState = 'approaching' | 'disintegrating' | 'fading';

const DISINTEGRATE_DURATION = 0.5;
const FADE_DURATION = 0.35;
const FLASH_DURATION = 0.4;
const FLASH_INTENSITY = 4;
const HIT_RADIUS = 0.5;

const HUMAN_SKIN = 0xc4956a;
const HUMAN_TUNIC = 0x6b5e4d;
const HUMAN_PANTS = 0x4a3f35;
const HUMAN_HAIR = 0x3a2a1a;
const HUMAN_EYE = 0x44ddff;
const HUMAN_GLOW = 0x22aacc;

const GHOST_BODY = 0x8899aa;
const GHOST_WISP = 0x556688;
const GHOST_EYE = 0xff2200;
const GHOST_GLOW = 0xff1100;

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
  private coreLight: THREE.PointLight;

  private pattern: MovementPattern;
  private baseX: number;
  private weaveAmplitude = 0.8 + Math.random() * 1.2;
  private weaveFreq = 1.5 + Math.random() * 1.5;
  private zigzagDir = 1;
  private zigzagTimer = 0;
  private zigzagInterval = 0.4 + Math.random() * 0.4;
  private flankTarget: number;

  private eyeMats: THREE.MeshBasicMaterial[] = [];
  private arms: THREE.Mesh[] = [];
  private legs: THREE.Mesh[] = [];
  private head: THREE.Mesh | null = null;
  private ragPanels: THREE.Mesh[] = [];
  private childVelocities: THREE.Vector3[] = [];
  private flashLight: THREE.PointLight | null = null;
  private flashGlow: THREE.Mesh | null = null;
  private flashBeam: THREE.Mesh | null = null;
  private flashTimer = 0;

  constructor(config: CreatureConfig) {
    this.type = config.type;
    this.speed = config.speed;
    this.targetZ = config.targetZ;
    this.mesh = new THREE.Group();
    this.coreLight = new THREE.PointLight(0x000000, 0, 0);
    this.pattern = config.pattern ?? 'straight';
    this.baseX = config.spawnX ?? (Math.random() - 0.5) * 3;
    this.flankTarget = this.baseX > 0 ? -0.5 : 0.5;

    if (this.type === 'human') this.buildHuman();
    else this.buildGhost();
    this.addHitArea();

    this.mesh.position.set(this.baseX, 0, config.spawnZ);
  }

  // ─── BUILD HUMAN (survivor running toward player) ─────────────────
  private buildHuman(): void {
    const skin = new THREE.MeshStandardMaterial({ color: HUMAN_SKIN, roughness: 0.8 });
    const tunic = new THREE.MeshStandardMaterial({ color: HUMAN_TUNIC, roughness: 0.9 });
    const pants = new THREE.MeshStandardMaterial({ color: HUMAN_PANTS, roughness: 0.9 });

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), skin);
    this.head.position.y = 1.38;
    this.mesh.add(this.head);

    // Hair
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshBasicMaterial({ color: HUMAN_HAIR })
    );
    hair.position.y = 1.42;
    this.mesh.add(hair);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.4, 0.14), tunic);
    torso.position.y = 1.0;
    this.mesh.add(torso);

    // Arms
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.38, 4), skin);
      arm.position.set(sx * 0.16, 0.95, 0);
      this.arms.push(arm);
      this.mesh.add(arm);
    }

    // Legs
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.45, 4), pants);
      leg.position.set(sx * 0.07, 0.35, 0);
      this.legs.push(leg);
      this.mesh.add(leg);
    }

    this.addEyes(HUMAN_EYE, HUMAN_GLOW, 1.4, 0.04);

    this.coreLight = new THREE.PointLight(HUMAN_GLOW, 0.4, 3);
    this.coreLight.position.set(0, 1.4, 0.15);
    this.mesh.add(this.coreLight);
  }

  // ─── BUILD GHOST (translucent floating specter) ───────────────────
  private buildGhost(): void {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: GHOST_BODY, transparent: true, opacity: 0.45,
      roughness: 0.3, metalness: 0.1, side: THREE.DoubleSide,
    });

    // Tapered body — round head flowing into a wispy tail
    const bodyPoints: THREE.Vector2[] = [];
    const seg = 12;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const y = t * 1.6;
      let r: number;
      if (t < 0.15) r = 0.2 * Math.sqrt(t / 0.15);
      else if (t < 0.4) r = 0.2 - (t - 0.15) * 0.15;
      else if (t < 0.7) r = 0.16 + Math.sin((t - 0.4) * Math.PI / 0.3) * 0.04;
      else r = 0.2 * (1 - (t - 0.7) / 0.3);
      bodyPoints.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    const body = new THREE.Mesh(new THREE.LatheGeometry(bodyPoints, 8), bodyMat);
    this.mesh.add(body);

    // Head — slightly translucent sphere
    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({
        color: GHOST_BODY, transparent: true, opacity: 0.5,
        roughness: 0.2, metalness: 0.1,
      })
    );
    this.head.position.y = 1.45;
    this.mesh.add(this.head);

    // Trailing wisp arms (reaching outward)
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.008, 0.4, 4),
        new THREE.MeshBasicMaterial({
          color: GHOST_WISP, transparent: true, opacity: 0.3,
        })
      );
      arm.position.set(sx * 0.2, 1.1, 0.08);
      arm.rotation.x = -0.6;
      arm.rotation.z = sx * 0.4;
      this.arms.push(arm);
      this.mesh.add(arm);
    }

    // Wispy tail tendrils
    const tailMat = new THREE.MeshBasicMaterial({
      color: GHOST_WISP, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 3; i++) {
      const tendril = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.3, 1, 3), tailMat);
      const angle = (i / 3) * Math.PI * 2;
      tendril.position.set(Math.cos(angle) * 0.08, 0.15, Math.sin(angle) * 0.08);
      tendril.rotation.y = angle;
      this.ragPanels.push(tendril);
      this.mesh.add(tendril);
    }

    // Additive glow aura
    const aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0x334466, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, side: THREE.BackSide,
      })
    );
    aura.position.y = 1.0;
    this.mesh.add(aura);

    this.addEyes(GHOST_EYE, GHOST_GLOW, 1.48, 0.055);

    this.coreLight = new THREE.PointLight(GHOST_GLOW, 0.5, 3);
    this.coreLight.position.set(0, 1.45, 0.15);
    this.mesh.add(this.coreLight);
  }

  // ─── SHARED BUILD HELPERS ─────────────────────────────────────────
  private addEyes(color: number, glowColor: number, headY: number, spacing: number): void {
    for (const sx of [-1, 1]) {
      const eyeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
      this.eyeMats.push(eyeMat);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), eyeMat);
      eye.position.set(sx * spacing, headY, 0.1);
      this.mesh.add(eye);

      const glowMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending,
      });
      this.eyeMats.push(glowMat);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 4), glowMat);
      glow.position.set(sx * spacing, headY, 0.1);
      this.mesh.add(glow);
    }
  }

  private addHitArea(): void {
    const mat = new THREE.MeshBasicMaterial();
    mat.colorWrite = false;
    mat.depthWrite = false;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(HIT_RADIUS, 6, 6), mat);
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
    this.flashBeam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      color: 0xffdd44, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.flashBeam.position.set(0, 0.9, 1.0);
    this.mesh.add(this.flashBeam);

    // Impact glow where the beam hits the creature body
    this.flashGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffee88, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending,
      })
    );
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
    this.coreLight.intensity = 2.5;

    const center = new THREE.Vector3(0, 0.85, 0);
    for (const child of this.mesh.children) {
      const dir = child.position.clone().sub(center).normalize();
      this.childVelocities.push(
        dir.multiplyScalar(2 + Math.random() * 3)
          .add(new THREE.Vector3(0, 1 + Math.random() * 2, 0))
      );
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = mat.opacity || 1;
      }
    }
  }

  private beginFade(): void {
    this.creatureState = 'fading';
    this.stateTimer = 0;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────
  update(delta: number): void {
    if (!this.alive) return;
    const t = (performance.now() - this.spawnTime) * 0.001;

    this.updateFlash(delta);

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
        else this.animateGhost(t);
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
    if (this.flashTimer <= 0) {
      this.mesh.remove(this.flashLight);
      this.flashLight = null;
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
  }

  private updateDisintegrating(delta: number): boolean {
    this.stateTimer += delta;
    if (this.stateTimer > DISINTEGRATE_DURATION) { this.alive = false; return true; }
    const fade = Math.max(0, 1 - this.stateTimer / DISINTEGRATE_DURATION * 1.5);
    for (let i = 0; i < this.mesh.children.length; i++) {
      const child = this.mesh.children[i];
      const vel = this.childVelocities[i];
      if (vel) {
        child.position.x += vel.x * delta;
        child.position.y += vel.y * delta;
        child.position.z += vel.z * delta;
      }
      if (child instanceof THREE.Mesh) {
        (child.material as THREE.MeshStandardMaterial).opacity =
          Math.min((child.material as THREE.MeshStandardMaterial).opacity, fade);
      }
    }
    this.coreLight.intensity *= 0.82;
    return true;
  }

  private updateFading(delta: number): boolean {
    this.stateTimer += delta;
    if (this.stateTimer > FADE_DURATION) { this.alive = false; return true; }
    const fade = Math.max(0, 1 - this.stateTimer / FADE_DURATION);
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial;
        if (mat.transparent) mat.opacity = Math.min(mat.opacity, fade);
      }
    });
    this.coreLight.intensity *= 0.8;
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
    // Running gait
    const stride = Math.sin(t * 8);
    this.mesh.position.y = Math.abs(Math.sin(t * 8)) * 0.06;

    if (this.arms[0]) this.arms[0].rotation.x = stride * 0.5;
    if (this.arms[1]) this.arms[1].rotation.x = -stride * 0.5;
    if (this.legs[0]) this.legs[0].rotation.x = -stride * 0.4;
    if (this.legs[1]) this.legs[1].rotation.x = stride * 0.4;
    if (this.head) this.head.rotation.y = Math.sin(t * 4) * 0.05;

    this.coreLight.intensity = 0.4 + Math.sin(t * 3) * 0.1;
  }

  private animateGhost(t: number): void {
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
      this.ragPanels[i].rotation.x = Math.sin(t * 1.5 + i * 1.1) * 0.25;
      this.ragPanels[i].rotation.z = Math.cos(t * 1.2 + i * 0.8) * 0.1;
    }

    // Flickering red eyes
    const flicker = Math.random() > 0.94 ? 0.15 : 1.0;
    this.coreLight.intensity = (0.5 + Math.sin(t * 3.5) * 0.2) * flicker;
    for (const mat of this.eyeMats) {
      mat.opacity = (0.85 + Math.sin(t * 5) * 0.1) * flicker;
    }
  }

  // ─── CLEANUP ──────────────────────────────────────────────────────
  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
