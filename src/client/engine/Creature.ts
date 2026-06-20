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

  constructor(config: CreatureConfig) {
    this.type = config.type;
    this.speed = config.speed;
    this.targetZ = config.targetZ;
    this.mesh = this.buildMesh();
    this.mesh.position.set(
      (Math.random() - 0.5) * 2,
      0,
      config.spawnZ
    );
  }

  private buildMesh(): THREE.Group {
    const group = new THREE.Group();

    if (this.type === 'friendly') {
      const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x88ccaa,
        emissive: 0x224433,
        emissiveIntensity: 0.4,
        transparent: true,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      group.add(body);

      const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xaaffcc,
        emissiveIntensity: 0.8,
        transparent: true,
      });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.12, 0.58, 0.28);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.12, 0.58, 0.28);
      group.add(leftEye, rightEye);

      const glow = new THREE.PointLight(0x88ccaa, 0.5, 4);
      glow.position.set(0, 0.5, 0);
      group.add(glow);
    } else {
      const bodyGeo = new THREE.ConeGeometry(0.3, 0.7, 4);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x442222,
        emissive: 0x331111,
        emissiveIntensity: 0.3,
        transparent: true,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      body.rotation.y = Math.PI / 4;
      group.add(body);

      const eyeGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff2200,
        emissive: 0xff4400,
        emissiveIntensity: 1.0,
        transparent: true,
      });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(-0.1, 0.6, 0.22);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(0.1, 0.6, 0.22);
      group.add(leftEye, rightEye);

      const glow = new THREE.PointLight(0xff2200, 0.4, 3);
      glow.position.set(0, 0.5, 0);
      group.add(glow);
    }

    return group;
  }

  update(delta: number): void {
    if (!this.alive) return;

    if (this.fadeOut) {
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.opacity -= this.fadeSpeed * delta;
        }
      });
      const sample = this.mesh.children[0] as THREE.Mesh;
      if (sample && (sample.material as THREE.MeshStandardMaterial).opacity <= 0) {
        this.alive = false;
      }
      return;
    }

    this.mesh.position.z += this.speed * delta;

    const bobAmount = Math.sin(performance.now() * 0.003 + this.mesh.id) * 0.02;
    this.mesh.position.y = bobAmount;
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

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }
}
