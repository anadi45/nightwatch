import * as THREE from 'three';

export type CreatureType = 'friendly' | 'threat';
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
  private weaveAmplitude: number;
  private weaveFreq: number;
  private zigzagDir = 1;
  private zigzagTimer = 0;
  private zigzagInterval: number;
  private flankTarget: number;

  private eyeMats: THREE.MeshBasicMaterial[] = [];
  private darkMotes: THREE.Mesh[] = [];
  private cloakPanels: THREE.Mesh[] = [];
  private childVelocities: THREE.Vector3[] = [];

  constructor(config: CreatureConfig) {
    this.type = config.type;
    this.speed = config.speed;
    this.targetZ = config.targetZ;
    this.mesh = new THREE.Group();
    this.coreLight = new THREE.PointLight(0x000000, 0, 0);

    this.pattern = config.pattern ?? 'straight';
    this.baseX = config.spawnX ?? (Math.random() - 0.5) * 3;
    this.weaveAmplitude = 0.8 + Math.random() * 1.2;
    this.weaveFreq = 1.5 + Math.random() * 1.5;
    this.zigzagInterval = 0.4 + Math.random() * 0.4;
    this.flankTarget = this.baseX > 0 ? -0.5 : 0.5;

    this.buildCreature();
    this.mesh.position.set(this.baseX, 0, config.spawnZ);
  }

  private buildCreature(): void {
    const eyeColor = this.type === 'friendly' ? 0x44ddff : 0xff2200;
    const glowColor = this.type === 'friendly' ? 0x22aacc : 0xff1100;
    const lightColor = this.type === 'friendly' ? 0x44aacc : 0xff1100;

    // Hooded body — identical for both types
    const bodyPoints: THREE.Vector2[] = [];
    const seg = 14;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const y = t * 1.8;
      let r: number;
      if (t < 0.08) r = 0.35 * Math.sqrt(t / 0.08);
      else if (t < 0.25) r = 0.35 - (t - 0.08) * 1.0;
      else if (t < 0.55) r = 0.18 + Math.sin(t * 30) * 0.015;
      else if (t < 0.7) r = 0.18 + (t - 0.55) * 0.3;
      else if (t < 0.85) r = 0.225 - (t - 0.7) * 0.8;
      else {
        const ht = (t - 0.85) / 0.15;
        r = 0.1 + Math.sin(ht * Math.PI) * 0.06;
      }
      bodyPoints.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    this.mesh.add(new THREE.Mesh(
      new THREE.LatheGeometry(bodyPoints, 8),
      new THREE.MeshStandardMaterial({
        color: 0x0a0512, emissive: 0x0a0010, emissiveIntensity: 0.2,
        transparent: true, roughness: 0.95,
      })
    ));

    // Hood
    const hood = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.35, 6),
      new THREE.MeshStandardMaterial({
        color: 0x080410, emissive: 0x060008, emissiveIntensity: 0.15,
        transparent: true, roughness: 1.0,
      })
    );
    hood.position.y = 1.7;
    this.mesh.add(hood);

    // Eyes — the ONLY distinguishing feature
    for (const sx of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true })
      );
      socket.position.set(sx * 0.06, 1.52, 0.12);
      this.mesh.add(socket);

      const eyeMat = new THREE.MeshBasicMaterial({
        color: eyeColor, transparent: true, opacity: 0.95,
      });
      this.eyeMats.push(eyeMat);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 4, 4), eyeMat);
      eye.position.set(sx * 0.06, 1.52, 0.14);
      this.mesh.add(eye);

      const gMat = new THREE.MeshBasicMaterial({
        color: glowColor, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending,
      });
      this.eyeMats.push(gMat);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 4, 4), gMat);
      glow.position.set(sx * 0.06, 1.52, 0.14);
      this.mesh.add(glow);
    }

    // Cloak panels
    const cloakMat = new THREE.MeshBasicMaterial({
      color: 0x0a0416, transparent: true, opacity: 0.4,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.2, 0.55, 1, 3),
        cloakMat
      );
      panel.position.set(Math.cos(angle) * 0.15, 0.32, Math.sin(angle) * 0.15);
      panel.rotation.y = angle;
      this.cloakPanels.push(panel);
      this.mesh.add(panel);
    }

    // Dark motes
    for (let i = 0; i < 4; i++) {
      const mote = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 3, 3),
        new THREE.MeshBasicMaterial({
          color: 0x110022, transparent: true, opacity: 0.3,
        })
      );
      this.darkMotes.push(mote);
      this.mesh.add(mote);
    }

    // Eye light
    this.coreLight = new THREE.PointLight(lightColor, 0.5, 3);
    this.coreLight.position.set(0, 1.52, 0.15);
    this.mesh.add(this.coreLight);

    // Invisible hit area for tap targeting
    const hitMat = new THREE.MeshBasicMaterial();
    hitMat.colorWrite = false;
    hitMat.depthWrite = false;
    const hitArea = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 6), hitMat);
    hitArea.position.y = 0.9;
    this.mesh.add(hitArea);
  }

  disintegrate(): void {
    if (this.handled) return;
    this.handled = true;
    this.startDisintegrate();
  }

  peacefulVanish(): void {
    if (this.handled) return;
    this.handled = true;
    this.startFade();
  }

  reachPlayer(): void {
    if (this.handled) return;
    this.handled = true;
    this.startFade();
  }

  isApproaching(): boolean {
    return this.creatureState === 'approaching' && this.alive;
  }

  private startDisintegrate(): void {
    this.creatureState = 'disintegrating';
    this.stateTimer = 0;
    this.coreLight.intensity = 2.5;
    const center = new THREE.Vector3(0, 0.9, 0);
    for (const child of this.mesh.children) {
      const dir = child.position.clone().sub(center);
      dir.normalize();
      this.childVelocities.push(
        dir.multiplyScalar(2 + Math.random() * 3)
          .add(new THREE.Vector3(0, 1 + Math.random() * 2, 0))
      );
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
        mat.transparent = true;
        if (mat.opacity === undefined || mat.opacity === 0) mat.opacity = 1;
      }
    }
  }

  private startFade(): void {
    this.creatureState = 'fading';
    this.stateTimer = 0;
  }

  update(delta: number): void {
    if (!this.alive) return;
    const t = (performance.now() - this.spawnTime) * 0.001;

    if (this.creatureState === 'disintegrating') {
      this.stateTimer += delta;
      if (this.stateTimer > 0.5) { this.alive = false; return; }
      const fade = Math.max(0, 1 - this.stateTimer * 2.5);
      for (let i = 0; i < this.mesh.children.length; i++) {
        const child = this.mesh.children[i];
        const vel = this.childVelocities[i];
        if (vel) {
          child.position.x += vel.x * delta;
          child.position.y += vel.y * delta;
          child.position.z += vel.z * delta;
        }
        if (child instanceof THREE.Mesh) {
          (child.material as any).opacity = Math.min((child.material as any).opacity, fade);
        }
      }
      this.coreLight.intensity *= 0.82;
      return;
    }

    if (this.creatureState === 'fading') {
      this.stateTimer += delta;
      if (this.stateTimer > 0.35) { this.alive = false; return; }
      const fade = Math.max(0, 1 - this.stateTimer * 3);
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as any;
          if (mat.transparent) mat.opacity = Math.min(mat.opacity, fade);
        }
      });
      this.coreLight.intensity *= 0.8;
      return;
    }

    this.mesh.position.z += this.speed * delta;
    this.applyMovementPattern(delta, t);
    this.updateVisuals(t);
  }

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

  private updateVisuals(t: number): void {
    this.mesh.position.y = Math.sin(t * 3) * 0.02;
    this.mesh.rotation.y = Math.sin(t * 1.5) * 0.05;

    for (let i = 0; i < this.cloakPanels.length; i++) {
      this.cloakPanels[i].rotation.x = Math.sin(t * 2 + i * 1.2) * 0.12;
    }

    for (let i = 0; i < this.darkMotes.length; i++) {
      const phase = (i / this.darkMotes.length) * Math.PI * 2;
      const r = 0.22 + Math.sin(t * 1.8 + i * 0.6) * 0.1;
      this.darkMotes[i].position.set(
        Math.cos(t * 1.2 + phase) * r,
        0.5 + (i / this.darkMotes.length) * 1.0 + Math.sin(t * 2.5 + phase) * 0.08,
        Math.sin(t * 1.2 + phase) * r
      );
    }

    const flicker = Math.random() > 0.95 ? 0.25 : 1.0;
    this.coreLight.intensity = (0.5 + Math.sin(t * 4) * 0.15) * flicker;
    for (const mat of this.eyeMats) {
      mat.opacity = (0.85 + Math.sin(t * 6) * 0.1) * flicker;
    }
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

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
}
