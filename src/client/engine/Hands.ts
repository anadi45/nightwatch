import * as THREE from 'three';
import { ParticleSystem } from './effects/Particles';

// HDR colors boosted above 1.0 to cross the bloom threshold
const LANTERN_CORE = new THREE.Color(0xffcc44).multiplyScalar(2.2);
const EMBER_COLOR = new THREE.Color(0xff7722).multiplyScalar(2.0);

// Shader-driven flame: cone vertices wag more toward the tip (uv.y),
// fragment blends white-hot base (HDR, blooms) to orange tip.
const FLAME_MAT_TEMPLATE = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSpeed: { value: 1 },
    uIntensity: { value: 1 },
    uColorBase: { value: new THREE.Color(0xff6600).multiplyScalar(1.4) },
    uColorHot: { value: new THREE.Color(0xffeeaa).multiplyScalar(2.6) },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    uniform float uSpeed;
    varying float vH;
    void main() {
      vH = uv.y;
      vec3 p = position;
      float wag = vH * vH;
      p.x += sin(uTime * 12.0 * uSpeed + vH * 6.0) * 0.02 * wag;
      p.z += cos(uTime * 9.0 * uSpeed + vH * 5.0) * 0.015 * wag;
      p.xz *= 1.0 + sin(uTime * 15.0 * uSpeed) * 0.06;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uSpeed;
    uniform float uIntensity;
    uniform vec3 uColorBase;
    uniform vec3 uColorHot;
    varying float vH;
    void main() {
      float hot = smoothstep(0.75, 0.05, vH);
      vec3 col = mix(uColorBase, uColorHot, hot) * uIntensity;
      float flicker = 0.85 + 0.15 * sin(uTime * 21.0 * uSpeed + vH * 4.0);
      float alpha = (1.0 - vH * 0.75) * flicker;
      gl_FragColor = vec4(col, alpha);
    }
  `,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});

export class Hands {
  private camera: THREE.PerspectiveCamera;
  private lanternGroup: THREE.Group;
  private torchGroup: THREE.Group;
  private torchFlameMat: THREE.ShaderMaterial;
  private lanternFlameMat: THREE.ShaderMaterial;
  private torchLight: THREE.PointLight;
  private embers: ParticleSystem;
  private emberTimer = 0;
  private heldOrb!: THREE.Group;
  private orbRegrow = 1;

  private lanternRestX = 0;
  private torchRestX = 0;
  private torchRestY = 0;
  private torchRestZ = 0;
  private torchRestRotX = 0;
  private lanternRestY = 0;

  private torchAnimTime = 0;
  private static readonly ANIM_DURATION = 0.35;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.torchFlameMat = FLAME_MAT_TEMPLATE.clone();
    this.lanternFlameMat = FLAME_MAT_TEMPLATE.clone();
    this.lanternFlameMat.uniforms.uSpeed!.value = 0.55; // calmer burn
    this.torchLight = new THREE.PointLight(0xff9930, 0.8, 4);
    this.embers = new ParticleSystem(40);

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
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const z = -0.4;
    const halfH = Math.tan(fovRad / 2) * Math.abs(z);
    const halfW = halfH * this.camera.aspect;

    const xOff = halfW * 0.75;
    const yOff = -halfH * 0.78;

    this.lanternGroup.position.set(-xOff, yOff, z);
    this.torchGroup.position.set(xOff, yOff, z);

    this.lanternRestX = -xOff;
    this.torchRestX = xOff;
    this.lanternRestY = yOff;
    this.torchRestY = yOff;
    this.torchRestZ = z;
  }

  private buildLantern(): THREE.Group {
    const group = new THREE.Group();
    const armMat = new THREE.MeshBasicMaterial({ color: 0x2a1e14 });
    const metalMat = new THREE.MeshBasicMaterial({ color: 0x241c10 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.055), armMat);
    arm.position.set(0, -0.04, 0);
    group.add(arm);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.06), armMat);
    fist.position.set(0, 0.11, 0);
    group.add(fist);

    // Golden crystal core with a live flame above it
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.045, 1),
      new THREE.MeshBasicMaterial({ color: LANTERN_CORE })
    );
    core.position.set(0, 0.2, 0);
    group.add(core);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.028, 0.09, 6, 4, true),
      this.lanternFlameMat
    );
    flame.position.set(0, 0.26, 0);
    group.add(flame);

    // Glow shell
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffeebb,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      })
    );
    glow.position.set(0, 0.22, 0);
    group.add(glow);

    // Cage: four bars + top/bottom rings + hanging handle
    const barGeo = new THREE.BoxGeometry(0.008, 0.13, 0.008);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const bar = new THREE.Mesh(barGeo, metalMat);
      bar.position.set(Math.cos(a) * 0.055, 0.22, Math.sin(a) * 0.055);
      group.add(bar);
    }
    const ringGeo = new THREE.TorusGeometry(0.058, 0.006, 4, 10);
    for (const y of [0.155, 0.285]) {
      const ring = new THREE.Mesh(ringGeo, metalMat);
      ring.position.set(0, y, 0);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 4, 8, Math.PI), metalMat);
    handle.position.set(0, 0.29, 0);
    group.add(handle);

    // Metal caps
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.02, 6), metalMat);
    cap.position.set(0, 0.295, 0);
    group.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.015, 6), metalMat);
    base.position.set(0, 0.15, 0);
    group.add(base);

    // Strong warm light
    const light = new THREE.PointLight(0xffaa44, 2.0, 8);
    light.position.set(0, 0.22, 0);
    group.add(light);

    return group;
  }

  // Right hand: open palm cradling a conjured fire orb. The orb is
  // "thrown" on tap (scales to zero) and regrows over ~0.35s.
  private buildTorch(): THREE.Group {
    const group = new THREE.Group();
    const armMat = new THREE.MeshBasicMaterial({ color: 0x2a1e14 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.28, 0.055), armMat);
    arm.position.set(0, -0.04, 0);
    group.add(arm);

    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.07), armMat);
    fist.position.set(0, 0.11, 0);
    group.add(fist);

    this.heldOrb = new THREE.Group();
    this.heldOrb.position.set(0, 0.21, 0);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffaa33).multiplyScalar(2.2) })
    );
    this.heldOrb.add(core);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.14, 8, 6, true),
      this.torchFlameMat
    );
    flame.position.y = 0.09;
    this.heldOrb.add(flame);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
      })
    );
    this.heldOrb.add(glow);
    group.add(this.heldOrb);

    // rising embers, in hand-local space so they follow the thrust
    group.add(this.embers.points);

    this.torchLight.position.set(0, 0.22, 0);
    group.add(this.torchLight);

    return group;
  }

  throwFireball(): void {
    this.torchAnimTime = 0.001;
    this.orbRegrow = 0;
  }

  private spawnEmbers(delta: number, rateMult: number): void {
    this.emberTimer -= delta;
    if (this.emberTimer > 0) return;
    this.emberTimer = 0.25 / rateMult;
    this.embers.spawn(
      new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.24, (Math.random() - 0.5) * 0.05),
      {
        color: EMBER_COLOR,
        velocity: new THREE.Vector3(0, 0.22, 0),
        spread: 0.1,
        gravity: 0.05,
        drag: 0.5,
        life: 0.5,
        lifeJitter: 0.5,
        size: 0.012,
        sizeJitter: 0.008,
      }
    );
  }

  update(delta: number, time: number): void {
    // slow figure-8 sway + breathing bob
    const idleBob = Math.sin(time * 1.5) * 0.005;
    const swayX = Math.sin(time * 0.9) * 0.004;
    const swayY = Math.sin(time * 1.8) * 0.003;

    this.torchFlameMat.uniforms.uTime!.value = time;
    this.lanternFlameMat.uniforms.uTime!.value = time;
    this.embers.update(delta);

    // orb regrows after a throw
    this.orbRegrow = Math.min(1, this.orbRegrow + delta / 0.35);
    const orbScale = this.orbRegrow * this.orbRegrow * (3 - 2 * this.orbRegrow);
    this.heldOrb.scale.setScalar(Math.max(0.001, orbScale));

    this.lanternGroup.position.x = this.lanternRestX + swayX;
    this.lanternGroup.position.y = this.lanternRestY + idleBob + swayY;
    this.lanternGroup.rotation.z = 0.06 + Math.sin(time * 0.7) * 0.01;

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
        this.torchFlameMat.uniforms.uIntensity!.value = 1 + e * 0.9;
        this.torchLight.intensity = (0.8 + e * 1.5) * (0.3 + orbScale * 0.7);
        this.spawnEmbers(delta, 4);
        return;
      }
    }

    this.torchGroup.position.x = this.torchRestX - swayX;
    this.torchGroup.position.y = this.torchRestY + idleBob - swayY;
    this.torchGroup.position.z = this.torchRestZ;
    this.torchGroup.rotation.x = this.torchRestRotX;
    this.torchFlameMat.uniforms.uIntensity!.value = 1;
    this.torchLight.intensity = (0.8 + Math.sin(time * 8) * 0.15) * (0.3 + orbScale * 0.7);
    if (orbScale > 0.5) this.spawnEmbers(delta, 1);
  }

  dispose(): void {
    this.embers.dispose();
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
