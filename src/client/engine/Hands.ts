import * as THREE from 'three';

export class Hands {
  private camera: THREE.PerspectiveCamera;
  private lanternGroup: THREE.Group;
  private torchGroup: THREE.Group;
  private flameMat: THREE.MeshBasicMaterial;
  private torchLight: THREE.PointLight;
  private lanternFlameMat: THREE.MeshBasicMaterial;

  private torchRestY = 0;
  private torchRestZ = 0;
  private torchRestRotX = 0;
  private lanternRestY = 0;

  private torchAnimTime = 0;
  private static readonly ANIM_DURATION = 0.35;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0xff8800, transparent: true, opacity: 0.9,
    });
    this.lanternFlameMat = new THREE.MeshBasicMaterial({
      color: 0xffcc44, transparent: true, opacity: 0.85,
    });
    this.torchLight = new THREE.PointLight(0xff9930, 0.8, 4);

    this.lanternGroup = this.buildLantern();
    this.torchGroup = this.buildTorch();

    this.lanternGroup.rotation.set(0.1, 0.15, 0.06);
    this.lanternGroup.scale.setScalar(0.6);
    this.torchGroup.rotation.set(0.2, -0.12, -0.06);
    this.torchGroup.scale.setScalar(0.6);
    this.torchRestRotX = 0.2;

    this.layoutHands();

    camera.add(this.lanternGroup);
    camera.add(this.torchGroup);

    window.addEventListener('resize', () => this.layoutHands());
  }

  private layoutHands(): void {
    const fovRad = this.camera.fov * Math.PI / 180;
    const z = -0.4;
    const halfH = Math.tan(fovRad / 2) * Math.abs(z);
    const halfW = halfH * this.camera.aspect;

    const xOff = halfW * 0.75;
    const yOff = -halfH * 0.78;

    this.lanternGroup.position.set(-xOff, yOff, z);
    this.torchGroup.position.set(xOff, yOff, z);

    this.lanternRestY = yOff;
    this.torchRestY = yOff;
    this.torchRestZ = z;
  }

  private buildLantern(): THREE.Group {
    const group = new THREE.Group();
    const armMat = new THREE.MeshBasicMaterial({ color: 0x2a1e14 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.055), armMat);
    arm.position.set(0, -0.04, 0);
    group.add(arm);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06), armMat);
    fist.position.set(0, 0.11, 0);
    group.add(fist);

    // Golden crystal core
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.06, 1),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 })
    );
    core.position.set(0, 0.22, 0);
    group.add(core);

    // Inner flame
    const inner = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.035, 0),
      this.lanternFlameMat
    );
    inner.position.set(0, 0.22, 0);
    group.add(inner);

    // Glow layers
    for (const [r, col, op] of [[0.1, 0xffeebb, 0.2], [0.18, 0xffcc55, 0.08]] as const) {
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(r, 6, 6),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: op,
          blending: THREE.AdditiveBlending, side: THREE.BackSide,
        })
      );
      glow.position.set(0, 0.22, 0);
      group.add(glow);
    }

    // Metal caps
    const capMat = new THREE.MeshBasicMaterial({ color: 0x3a3020 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.02, 5), capMat);
    cap.position.set(0, 0.28, 0);
    group.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.015, 5), capMat);
    base.position.set(0, 0.165, 0);
    group.add(base);

    // Strong warm light
    const light = new THREE.PointLight(0xffaa44, 2.0, 8);
    light.position.set(0, 0.22, 0);
    group.add(light);

    return group;
  }

  private buildTorch(): THREE.Group {
    const group = new THREE.Group();
    const armMat = new THREE.MeshBasicMaterial({ color: 0x2a1e14 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.055), armMat);
    arm.position.set(0, -0.04, 0);
    group.add(arm);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06), armMat);
    fist.position.set(0, 0.11, 0);
    group.add(fist);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.018, 0.32, 4),
      new THREE.MeshBasicMaterial({ color: 0x3a2510 })
    );
    shaft.position.set(0, 0.22, 0);
    group.add(shaft);

    const wrap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.022, 0.06, 4),
      new THREE.MeshBasicMaterial({ color: 0x2a1a0a })
    );
    wrap.position.set(0, 0.36, 0);
    group.add(wrap);

    const flameGeo = new THREE.SphereGeometry(0.035, 4, 4);
    flameGeo.scale(1, 1.7, 1);
    const flame = new THREE.Mesh(flameGeo, this.flameMat);
    flame.position.set(0, 0.43, 0);
    group.add(flame);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 4, 4),
      new THREE.MeshBasicMaterial({
        color: 0xffaa33, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending,
      })
    );
    glow.position.set(0, 0.43, 0);
    group.add(glow);

    this.torchLight.position.set(0, 0.45, 0);
    group.add(this.torchLight);

    return group;
  }

  thrustTorch(): void {
    this.torchAnimTime = 0.001;
  }

  update(delta: number, time: number): void {
    const idleBob = Math.sin(time * 1.5) * 0.005;

    this.lanternGroup.position.y = this.lanternRestY + idleBob;
    this.lanternFlameMat.opacity = 0.8 + Math.sin(time * 10) * 0.1;

    if (this.torchAnimTime > 0) {
      this.torchAnimTime += delta;
      if (this.torchAnimTime >= Hands.ANIM_DURATION) {
        this.torchAnimTime = 0;
      } else {
        const t = this.torchAnimTime / Hands.ANIM_DURATION;
        const thrust = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const e = Math.sin(thrust * Math.PI * 0.5);
        this.torchGroup.position.y = this.torchRestY + e * 0.1 + idleBob;
        this.torchGroup.position.z = this.torchRestZ - e * 0.08;
        this.torchGroup.rotation.x = this.torchRestRotX - e * 0.3;
        this.flameMat.color.setHex(e > 0.3 ? 0xffdd55 : 0xff8800);
        this.torchLight.intensity = 0.8 + e * 1.5;
        return;
      }
    }

    this.torchGroup.position.y = this.torchRestY + idleBob;
    this.torchGroup.position.z = this.torchRestZ;
    this.torchGroup.rotation.x = this.torchRestRotX;
    this.flameMat.color.setHex(0xff8800);
    this.flameMat.opacity = 0.85 + Math.sin(time * 12) * 0.1;
    this.torchLight.intensity = 0.8 + Math.sin(time * 8) * 0.15;
  }

  dispose(): void {
    for (const group of [this.lanternGroup, this.torchGroup]) {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
  }
}
