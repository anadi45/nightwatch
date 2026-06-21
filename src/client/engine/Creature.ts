import * as THREE from 'three';

export type CreatureType = 'friendly' | 'threat';

export interface CreatureConfig {
  type: CreatureType;
  speed: number;
  spawnZ: number;
  targetZ: number;
}

export class Creature {
  readonly type: CreatureType;
  readonly mesh: THREE.Group;
  private speed: number;
  private targetZ: number;
  private alive = true;
  private fadeOut = false;
  private fadeSpeed = 3;
  private fadeProgress = 1;
  private spawnTime = performance.now();
  private coreLight: THREE.PointLight;

  private innerCore: THREE.Mesh | null = null;
  private crystalShards: THREE.Mesh[] = [];
  private wingMeshes: THREE.Mesh[] = [];
  private trailMotes: THREE.Mesh[] = [];

  private cloakPanels: THREE.Mesh[] = [];
  private armGroups: THREE.Group[] = [];
  private darkMotes: THREE.Mesh[] = [];
  private eyeMats: THREE.MeshBasicMaterial[] = [];

  constructor(config: CreatureConfig) {
    this.type = config.type;
    this.speed = config.speed;
    this.targetZ = config.targetZ;
    this.mesh = new THREE.Group();
    this.coreLight = new THREE.PointLight(0x000000, 0, 0);

    if (this.type === 'friendly') {
      this.buildFriendly();
    } else {
      this.buildThreat();
    }

    this.mesh.position.set(
      (Math.random() - 0.5) * 2,
      0,
      config.spawnZ
    );
  }

  // ─── LANTERN SPIRIT ───────────────────────────────────────────────
  private buildFriendly(): void {
    // Crystalline core with vertex displacement
    const coreGeo = new THREE.IcosahedronGeometry(0.28, 1);
    const pos = coreGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const n = 1 + Math.sin(x * 17) * Math.cos(y * 13) * Math.sin(z * 19) * 0.12;
      pos.setXYZ(i, (x / len) * 0.28 * n, (y / len) * 0.28 * n, (z / len) * 0.28 * n);
    }
    coreGeo.computeVertexNormals();

    const core = new THREE.Mesh(coreGeo, new THREE.MeshStandardMaterial({
      color: 0xffcc44, emissive: 0xffaa22, emissiveIntensity: 1.0,
      roughness: 0.08, metalness: 0.3,
    }));
    core.position.y = 1.0;
    this.mesh.add(core);

    // Inner rotating flame
    this.innerCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.14, 0),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending,
      })
    );
    this.innerCore.position.y = 1.0;
    this.mesh.add(this.innerCore);

    // Single glow layer
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffeebb, transparent: true, opacity: 0.12,
        blending: THREE.AdditiveBlending, side: THREE.BackSide,
      })
    );
    glow.position.y = 1.0;
    this.mesh.add(glow);

    // 3 floating crystal shards
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd, emissive: 0xffcc88, emissiveIntensity: 0.7,
      roughness: 0.1, metalness: 0.4,
    });
    for (let i = 0; i < 3; i++) {
      const shardGeo = new THREE.OctahedronGeometry(0.05, 0);
      shardGeo.scale(1, 2.8, 1);
      const shard = new THREE.Mesh(shardGeo, shardMat);
      const angle = (i / 3) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * 0.22, 1.48, Math.sin(angle) * 0.22);
      this.crystalShards.push(shard);
      this.mesh.add(shard);
    }

    // 1 pair of wings
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xffddaa, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide,
    });
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.18, 0.08, 0.4, 0.38, 0.22, 0.65);
      shape.bezierCurveTo(0.12, 0.48, 0.04, 0.22, 0, 0);
      const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), wingMat);
      wing.position.set(side * 0.12, 0.7, 0);
      wing.rotation.z = side * 0.2;
      wing.rotation.y = side * 0.12;
      if (side === -1) wing.scale.x = -1;
      this.wingMeshes.push(wing);
      this.mesh.add(wing);
    }

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.032, 4, 4);
    eyeGeo.scale(1.4, 0.65, 1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a3a });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * 0.09, 1.06, 0.25);
      this.mesh.add(eye);
    }

    // 4 trailing motes
    for (let i = 0; i < 4; i++) {
      const mote = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 3, 3),
        new THREE.MeshBasicMaterial({
          color: 0xffeeaa, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending,
        })
      );
      this.trailMotes.push(mote);
      this.mesh.add(mote);
    }

    // Single warm light
    this.coreLight = new THREE.PointLight(0xffaa44, 1.8, 8);
    this.coreLight.position.set(0, 1.0, 0);
    this.mesh.add(this.coreLight);
  }

  // ─── SHADOW WRAITH ────────────────────────────────────────────────
  private buildThreat(): void {
    // Tall ribbed body
    const bodyPoints: THREE.Vector2[] = [];
    const seg = 16;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const y = t * 1.8;
      let r: number;
      if (t < 0.08) r = 0.38 * Math.sqrt(t / 0.08);
      else if (t < 0.25) r = 0.38 - (t - 0.08) * 1.1;
      else if (t < 0.5) r = 0.19 + Math.sin(t * 35) * 0.025;
      else if (t < 0.68) r = 0.19 + (t - 0.5) * 0.35;
      else if (t < 0.82) r = 0.255 - (t - 0.68) * 1.2;
      else {
        const ht = (t - 0.82) / 0.18;
        r = 0.09 + Math.sin(ht * Math.PI) * 0.07;
      }
      bodyPoints.push(new THREE.Vector2(Math.max(0.01, r), y));
    }
    this.mesh.add(new THREE.Mesh(
      new THREE.LatheGeometry(bodyPoints, 8),
      new THREE.MeshStandardMaterial({
        color: 0x08030f, emissive: 0x12001e, emissiveIntensity: 0.35,
        roughness: 0.95,
      })
    ));

    // Skull
    const skullGeo = new THREE.SphereGeometry(0.17, 8, 6);
    skullGeo.scale(1.05, 1.35, 1.15);
    const skull = new THREE.Mesh(skullGeo, new THREE.MeshStandardMaterial({
      color: 0x160a1e, emissive: 0x0c0014, emissiveIntensity: 0.4,
      roughness: 0.65, metalness: 0.2,
    }));
    skull.position.set(0, 1.68, 0.04);
    this.mesh.add(skull);

    // Horns
    const hornMat = new THREE.MeshStandardMaterial({
      color: 0x18081a, emissive: 0x1e0030, emissiveIntensity: 0.25,
      roughness: 0.35, metalness: 0.5,
    });
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.45, 4), hornMat);
      horn.position.set(side * 0.2, 1.9, -0.06);
      horn.rotation.z = side * -0.4;
      horn.rotation.x = -0.2;
      this.mesh.add(horn);
    }

    // Eyes — store material refs for flicker (no per-frame traverse)
    for (const sx of [-1, 1]) {
      const socket = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x000000 })
      );
      socket.position.set(sx * 0.075, 1.7, 0.15);
      this.mesh.add(socket);

      const eyeMat = new THREE.MeshBasicMaterial({
        color: 0xff1100, transparent: true, opacity: 1.0,
      });
      this.eyeMats.push(eyeMat);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 4, 4), eyeMat);
      eye.position.set(sx * 0.075, 1.7, 0.175);
      this.mesh.add(eye);

      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff2200, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending,
      });
      this.eyeMats.push(glowMat);
      const eyeGlow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), glowMat);
      eyeGlow.position.set(sx * 0.075, 1.7, 0.175);
      this.mesh.add(eyeGlow);
    }

    // Arms (upper + forearm per side)
    const armMat = new THREE.MeshBasicMaterial({ color: 0x120820 });
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();

      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.016, 0.45, 3), armMat
      );
      upper.position.set(side * 0.3, 1.0, 0.08);
      upper.rotation.z = side * -0.55;
      upper.rotation.x = 0.25;
      arm.add(upper);

      const forearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.008, 0.35, 3), armMat
      );
      forearm.position.set(side * 0.44, 0.72, 0.18);
      forearm.rotation.z = side * -0.85;
      forearm.rotation.x = 0.5;
      arm.add(forearm);

      const claw = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.12, 3), armMat
      );
      claw.position.set(side * 0.5, 0.56, 0.25);
      claw.rotation.z = side * -1.0;
      claw.rotation.x = 0.6;
      arm.add(claw);

      this.armGroups.push(arm);
      this.mesh.add(arm);
    }

    // 4 cloak panels
    const cloakMat = new THREE.MeshBasicMaterial({
      color: 0x0b0416, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.22, 0.7, 1, 3),
        cloakMat
      );
      panel.position.set(Math.cos(angle) * 0.18, 0.38, Math.sin(angle) * 0.18);
      panel.rotation.y = angle;
      this.cloakPanels.push(panel);
      this.mesh.add(panel);
    }

    // 3 spinal ridges
    const ridgeMat = new THREE.MeshBasicMaterial({ color: 0x1e0a2a });
    for (let i = 0; i < 3; i++) {
      const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 3), ridgeMat);
      ridge.position.set(0, 0.7 + i * 0.25, -0.16);
      ridge.rotation.x = -0.35;
      this.mesh.add(ridge);
    }

    // 5 dark motes
    for (let i = 0; i < 5; i++) {
      const mote = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 3, 3),
        new THREE.MeshBasicMaterial({
          color: 0x1a0030, transparent: true, opacity: 0.35,
        })
      );
      this.darkMotes.push(mote);
      this.mesh.add(mote);
    }

    // Single red light
    this.coreLight = new THREE.PointLight(0xff1100, 0.7, 5);
    this.coreLight.position.set(0, 1.7, 0.2);
    this.mesh.add(this.coreLight);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────
  update(delta: number): void {
    if (!this.alive) return;
    const t = (performance.now() - this.spawnTime) * 0.001;

    if (this.fadeOut) {
      this.fadeProgress -= this.fadeSpeed * delta;
      if (this.fadeProgress <= 0) { this.alive = false; return; }
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.Material & { opacity?: number };
          if (mat.transparent && mat.opacity !== undefined) {
            mat.opacity = Math.min(mat.opacity, this.fadeProgress);
          }
        }
      });
      this.coreLight.intensity *= 0.82;
      return;
    }

    this.mesh.position.z += this.speed * delta;

    if (this.type === 'friendly') this.updateFriendly(t);
    else this.updateThreat(t);
  }

  private updateFriendly(t: number): void {
    this.mesh.position.y = Math.sin(t * 1.5) * 0.1 + Math.sin(t * 0.7) * 0.05;
    this.mesh.rotation.y = Math.sin(t * 0.5) * 0.08;

    if (this.innerCore) {
      this.innerCore.rotation.x = t * 1.3;
      this.innerCore.rotation.y = t * 0.9;
    }

    for (let i = 0; i < this.crystalShards.length; i++) {
      const angle = t * 0.7 + (i / this.crystalShards.length) * Math.PI * 2;
      const r = 0.22 + Math.sin(t * 2 + i) * 0.04;
      this.crystalShards[i].position.set(
        Math.cos(angle) * r, 1.48 + Math.sin(t * 1.6 + i * 1.2) * 0.06,
        Math.sin(angle) * r
      );
      this.crystalShards[i].rotation.y = t * 2 + i;
    }

    for (let i = 0; i < this.wingMeshes.length; i++) {
      const side = i === 0 ? -1 : 1;
      const flutter = Math.sin(t * 3.5) * 0.18;
      this.wingMeshes[i].rotation.z = side * (0.2 + flutter);
    }

    for (let i = 0; i < this.trailMotes.length; i++) {
      const phase = (i / this.trailMotes.length) * Math.PI * 2;
      const orbitR = 0.45 + Math.sin(t * 1.5 + i * 0.9) * 0.15;
      this.trailMotes[i].position.set(
        Math.cos(t * 1.1 + phase) * orbitR,
        0.75 + Math.sin(t * 2.2 + phase) * 0.3,
        Math.sin(t * 1.1 + phase) * orbitR
      );
    }

    this.coreLight.intensity = 1.8 + Math.sin(t * 2.5) * 0.4;
  }

  private updateThreat(t: number): void {
    this.mesh.position.y = Math.sin(t * 4.5) * 0.02;
    this.mesh.position.x += Math.sin(t * 7.5) * 0.003;

    for (let i = 0; i < this.cloakPanels.length; i++) {
      this.cloakPanels[i].rotation.x = Math.sin(t * 2.2 + i * 1.1) * 0.15;
    }

    for (let i = 0; i < this.armGroups.length; i++) {
      this.armGroups[i].rotation.x = Math.sin(t * 1.6 + i * Math.PI) * 0.08;
    }

    for (let i = 0; i < this.darkMotes.length; i++) {
      const phase = (i / this.darkMotes.length) * Math.PI * 2;
      const r = 0.28 + Math.sin(t * 2 + i * 0.5) * 0.12;
      const yBase = 0.3 + (i / this.darkMotes.length) * 1.4;
      this.darkMotes[i].position.set(
        Math.cos(t * 1.3 + phase) * r,
        yBase + Math.sin(t * 2.8 + phase) * 0.1,
        Math.sin(t * 1.3 + phase) * r
      );
    }

    const flicker = Math.random() > 0.93 ? 0.08 : 1.0;
    this.coreLight.intensity = (0.7 + Math.sin(t * 5.5) * 0.2) * flicker;
    for (const mat of this.eyeMats) {
      mat.opacity = (0.8 + Math.sin(t * 8) * 0.2) * flicker;
    }
  }

  hasReachedTarget(): boolean {
    return this.mesh.position.z >= this.targetZ;
  }

  dismiss(): void {
    this.fadeOut = true;
  }

  isAlive(): boolean {
    return this.alive;
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
