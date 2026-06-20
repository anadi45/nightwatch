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
  private spawnTime = performance.now();
  private orbitals: THREE.Mesh[] = [];
  private tendrils: THREE.Mesh[] = [];
  private coreLight: THREE.PointLight;

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

  private buildFriendly(): void {
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xffcc44,
      emissive: 0xffaa22,
      emissiveIntensity: 0.8,
      transparent: true,
      roughness: 0.2,
    });
    const coreGeo = new THREE.SphereGeometry(0.25, 24, 24);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 0.8;
    this.mesh.add(core);

    const innerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffeebb,
      transparent: true,
      opacity: 0.25,
    });
    const innerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 16, 16),
      innerGlowMat
    );
    innerGlow.position.y = 0.8;
    this.mesh.add(innerGlow);

    const outerGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffdd88,
      transparent: true,
      opacity: 0.08,
    });
    const outerGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 12),
      outerGlowMat
    );
    outerGlow.position.y = 0.8;
    this.mesh.add(outerGlow);

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      emissive: 0xffcc88,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.5,
    });

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(0.25, 0.3, 0.1, 0.5);
    wingShape.quadraticCurveTo(-0.05, 0.3, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(wingShape);

    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-0.2, 0.65, 0);
    leftWing.rotation.z = 0.3;
    this.mesh.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, wingMat.clone());
    rightWing.position.set(0.2, 0.65, 0);
    rightWing.rotation.z = -0.3;
    rightWing.scale.x = -1;
    this.mesh.add(rightWing);

    for (let i = 0; i < 5; i++) {
      const orbMat = new THREE.MeshBasicMaterial({
        color: 0xffeeaa,
        transparent: true,
        opacity: 0.7,
      });
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        orbMat
      );
      this.orbitals.push(orb);
      this.mesh.add(orb);
    }

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
    });
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 0.85, 0.22);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    rightEye.position.set(0.08, 0.85, 0.22);
    this.mesh.add(leftEye, rightEye);

    this.coreLight = new THREE.PointLight(0xffaa44, 1.2, 6);
    this.coreLight.position.set(0, 0.8, 0);
    this.mesh.add(this.coreLight);
  }

  private buildThreat(): void {
    const bodyPoints: THREE.Vector2[] = [];
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * 1.4;
      let radius: number;
      if (t < 0.15) {
        radius = 0.05 + t * 1.5;
      } else if (t < 0.5) {
        radius = 0.28 - (t - 0.15) * 0.3;
      } else if (t < 0.8) {
        radius = 0.18 + Math.sin((t - 0.5) * 10) * 0.06;
      } else {
        radius = 0.18 * (1 - (t - 0.8) / 0.2);
      }
      bodyPoints.push(new THREE.Vector2(radius, y));
    }
    const bodyGeo = new THREE.LatheGeometry(bodyPoints, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a0a1a,
      emissive: 0x220022,
      emissiveIntensity: 0.2,
      transparent: true,
      roughness: 0.9,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0;
    this.mesh.add(body);

    const hoodGeo = new THREE.ConeGeometry(0.3, 0.5, 6);
    const hoodMat = new THREE.MeshStandardMaterial({
      color: 0x0d0515,
      emissive: 0x110011,
      emissiveIntensity: 0.15,
      transparent: true,
      roughness: 1.0,
    });
    const hood = new THREE.Mesh(hoodGeo, hoodMat);
    hood.position.y = 1.35;
    this.mesh.add(hood);

    const eyeMat = new THREE.MeshBasicMaterial({
      color: 0xff1100,
      transparent: true,
    });
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.08, 1.15, 0.2);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    rightEye.position.set(0.08, 1.15, 0.2);
    this.mesh.add(leftEye, rightEye);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xff2200,
      transparent: true,
      opacity: 0.15,
    });
    const leftGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      glowMat
    );
    leftGlow.position.copy(leftEye.position);
    const rightGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      glowMat.clone()
    );
    rightGlow.position.copy(rightEye.position);
    this.mesh.add(leftGlow, rightGlow);

    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0x2a0a2a,
      emissive: 0x1a0022,
      emissiveIntensity: 0.3,
      transparent: true,
      roughness: 0.7,
    });
    const spikePositions = [
      { x: -0.25, y: 0.9, z: -0.1, ry: 0, rz: -0.5 },
      { x: 0.25, y: 0.9, z: -0.1, ry: 0, rz: 0.5 },
      { x: -0.18, y: 1.1, z: -0.15, ry: 0.3, rz: -0.7 },
      { x: 0.18, y: 1.1, z: -0.15, ry: -0.3, rz: 0.7 },
      { x: 0, y: 0.5, z: -0.2, ry: 0, rz: Math.PI },
    ];
    for (const sp of spikePositions) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.04, 0.25, 4),
        spikeMat.clone()
      );
      spike.position.set(sp.x, sp.y, sp.z);
      spike.rotation.set(0, sp.ry, sp.rz);
      this.mesh.add(spike);
    }

    for (let i = 0; i < 4; i++) {
      const tendrilMat = new THREE.MeshBasicMaterial({
        color: 0x220033,
        transparent: true,
        opacity: 0.4,
      });
      const tendril = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.03, 0.5, 4),
        tendrilMat
      );
      const angle = (i / 4) * Math.PI * 2;
      tendril.position.set(
        Math.cos(angle) * 0.15,
        0.1,
        Math.sin(angle) * 0.15
      );
      this.tendrils.push(tendril);
      this.mesh.add(tendril);
    }

    this.coreLight = new THREE.PointLight(0xff1100, 0.4, 3);
    this.coreLight.position.set(0, 1.15, 0.2);
    this.mesh.add(this.coreLight);
  }

  update(delta: number): void {
    if (!this.alive) return;

    const t = (performance.now() - this.spawnTime) * 0.001;

    if (this.fadeOut) {
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          if ('opacity' in mat) {
            mat.opacity = Math.max(0, mat.opacity - this.fadeSpeed * delta);
          }
        }
      });
      this.coreLight.intensity *= 0.85;
      const sample = this.mesh.children[0] as THREE.Mesh;
      if (sample && (sample.material as THREE.MeshStandardMaterial).opacity <= 0.01) {
        this.alive = false;
      }
      return;
    }

    this.mesh.position.z += this.speed * delta;

    if (this.type === 'friendly') {
      this.mesh.position.y = Math.sin(t * 2) * 0.08;

      for (let i = 0; i < this.orbitals.length; i++) {
        const angle = t * 1.5 + (i / this.orbitals.length) * Math.PI * 2;
        const radius = 0.45 + Math.sin(t * 3 + i) * 0.08;
        const orb = this.orbitals[i];
        orb.position.set(
          Math.cos(angle) * radius,
          0.8 + Math.sin(t * 2.5 + i * 1.2) * 0.15,
          Math.sin(angle) * radius
        );
        (orb.material as THREE.MeshBasicMaterial).opacity =
          0.4 + Math.sin(t * 4 + i) * 0.3;
      }

      this.coreLight.intensity = 1.2 + Math.sin(t * 3) * 0.3;
    } else {
      this.mesh.position.y = Math.sin(t * 4) * 0.03;
      this.mesh.position.x += Math.sin(t * 7) * 0.002;

      const flicker = Math.random() > 0.92 ? 0.1 : 1.0;
      this.coreLight.intensity = (0.4 + Math.sin(t * 6) * 0.2) * flicker;

      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material;
          if (mat instanceof THREE.MeshBasicMaterial && mat.color.r > 0.8) {
            mat.opacity = (0.8 + Math.sin(t * 8) * 0.2) * flicker;
          }
        }
      });

      for (let i = 0; i < this.tendrils.length; i++) {
        const tendril = this.tendrils[i];
        tendril.rotation.x = Math.sin(t * 3 + i * 1.5) * 0.3;
        tendril.rotation.z = Math.cos(t * 2.5 + i) * 0.2;
      }
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
