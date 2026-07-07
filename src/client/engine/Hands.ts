import * as THREE from 'three';
import { ParticleSystem } from './effects/Particles';

// HDR colors boosted above 1.0 to cross the bloom threshold
const EMBER_COLOR = new THREE.Color(0xff7722).multiplyScalar(2.0);

// shared hand materials — never mutated
const SKIN_MAT = new THREE.MeshStandardMaterial({ color: 0xc98d63, roughness: 0.9 });
const SLEEVE_MAT = new THREE.MeshStandardMaterial({ color: 0x231a10, roughness: 1.0 });

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

interface FingerSpec {
  x: number;
  radius: number;
  len1: number;
  len2: number;
}

const FINGERS: FingerSpec[] = [
  { x: -0.0285, radius: 0.009, len1: 0.03, len2: 0.024 }, // pinky-ish
  { x: -0.0095, radius: 0.0105, len1: 0.037, len2: 0.03 },
  { x: 0.0095, radius: 0.0105, len1: 0.04, len2: 0.032 },
  { x: 0.0285, radius: 0.0095, len1: 0.034, len2: 0.027 },
];

/**
 * First-person arms. Hand local space: wrist at origin, fingers extend
 * +Y, palm normal +Z; positive knuckle rotation.x curls toward the palm.
 * Left hand grips a hanging lantern (Kenney model installed after
 * assets load), right hand cups a conjured fire orb.
 */
export class Hands {
  private camera: THREE.PerspectiveCamera;
  private lanternGroup: THREE.Group;
  private torchGroup: THREE.Group;
  private lanternMount!: THREE.Group;
  private lanternPlaceholder!: THREE.Mesh;
  private flameMats: THREE.ShaderMaterial[] = [];
  private torchFlameMats: THREE.ShaderMaterial[] = [];
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
    this.torchLight = new THREE.PointLight(0xff9930, 0.8, 4);
    this.embers = new ParticleSystem(40);

    this.lanternGroup = this.buildLanternArm();
    this.torchGroup = this.buildOrbArm();

    this.lanternGroup.rotation.set(0.1, 0.18, 0.08);
    this.lanternGroup.scale.setScalar(0.6);
    this.torchGroup.rotation.set(0.2, -0.15, -0.08);
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
    const yOff = -halfH * 0.82;

    this.lanternGroup.position.set(-xOff, yOff, z);
    this.torchGroup.position.set(xOff, yOff, z);

    this.lanternRestX = -xOff;
    this.torchRestX = xOff;
    this.lanternRestY = yOff;
    this.torchRestY = yOff;
    this.torchRestZ = z;
  }

  // ─── HAND / ARM CONSTRUCTION ──────────────────────────────────────
  private buildFinger(spec: FingerSpec, curl1: number, curl2: number): THREE.Group {
    const knuckle = new THREE.Group();
    knuckle.position.set(spec.x, 0.095, 0.004);
    knuckle.rotation.x = curl1;

    const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(spec.radius, spec.len1, 3, 6), SKIN_MAT);
    seg1.position.y = spec.len1 / 2;
    knuckle.add(seg1);

    const joint = new THREE.Group();
    joint.position.y = spec.len1;
    joint.rotation.x = curl2;
    const seg2 = new THREE.Mesh(
      new THREE.CapsuleGeometry(spec.radius * 0.88, spec.len2, 3, 6),
      SKIN_MAT
    );
    seg2.position.y = spec.len2 / 2;
    joint.add(seg2);
    knuckle.add(joint);

    return knuckle;
  }

  /** side: +1 right hand, -1 left hand (mirrors the thumb). */
  private buildHand(side: 1 | -1, curl1: number, curl2: number, thumbCurl: number): THREE.Group {
    const hand = new THREE.Group();

    // palm: flattened capsule
    const palm = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.05, 4, 8), SKIN_MAT);
    palm.scale.set(1.25, 1, 0.55);
    palm.position.y = 0.048;
    hand.add(palm);

    for (const spec of FINGERS) {
      hand.add(this.buildFinger(spec, curl1, curl2));
    }

    // thumb: splayed from the palm edge
    const thumbRoot = new THREE.Group();
    thumbRoot.position.set(side * -0.044, 0.035, 0.012);
    thumbRoot.rotation.set(thumbCurl, 0, side * -0.9);
    const thumb1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115, 0.032, 3, 6), SKIN_MAT);
    thumb1.position.y = 0.016;
    thumbRoot.add(thumb1);
    const thumbJoint = new THREE.Group();
    thumbJoint.position.y = 0.032;
    thumbJoint.rotation.x = thumbCurl * 0.8;
    const thumb2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.026, 3, 6), SKIN_MAT);
    thumb2.position.y = 0.013;
    thumbJoint.add(thumb2);
    thumbRoot.add(thumbJoint);
    hand.add(thumbRoot);

    return hand;
  }

  /** Sleeve + forearm rising from the bottom of the frame to the wrist. */
  private buildArmBase(group: THREE.Group): void {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.17, 8), SLEEVE_MAT);
    sleeve.position.y = -0.1;
    group.add(sleeve);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 5, 10), SLEEVE_MAT);
    cuff.position.y = -0.02;
    cuff.rotation.x = Math.PI / 2;
    group.add(cuff);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), SKIN_MAT);
    forearm.position.y = 0.02;
    group.add(forearm);
  }

  private buildFlame(radius: number, height: number, speed: number): THREE.Group {
    const group = new THREE.Group();
    const outer = FLAME_MAT_TEMPLATE.clone();
    outer.uniforms.uSpeed!.value = speed;
    const outerMesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 8, 6, true), outer);
    group.add(outerMesh);

    const inner = FLAME_MAT_TEMPLATE.clone();
    inner.uniforms.uSpeed!.value = speed * 1.3;
    (inner.uniforms.uColorBase!.value as THREE.Color).setHex(0xffbb44).multiplyScalar(2.0);
    (inner.uniforms.uColorHot!.value as THREE.Color).setHex(0xfff6dd).multiplyScalar(3.0);
    const innerMesh = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 0.5, height * 0.65, 6, 4, true),
      inner
    );
    innerMesh.position.y = -height * 0.12;
    group.add(innerMesh);

    this.flameMats.push(outer, inner);
    return group;
  }

  // ─── LEFT: lantern carried in a fist ──────────────────────────────
  private buildLanternArm(): THREE.Group {
    const group = new THREE.Group();
    this.buildArmBase(group);

    // fist: knuckles forward, fingers fully curled around the handle
    const hand = this.buildHand(-1, 1.25, 1.35, 1.0);
    hand.position.y = 0.07;
    hand.rotation.x = -0.55;
    group.add(hand);

    // handle bar the fist wraps around
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.09, 6),
      SLEEVE_MAT
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.115, 0.045);
    group.add(bar);

    // lantern hangs below the fist; kit model swaps in after load
    this.lanternMount = new THREE.Group();
    this.lanternMount.position.set(0, 0.1, 0.05);
    group.add(this.lanternMount);

    this.lanternPlaceholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.05, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffcc44).multiplyScalar(2.2) })
    );
    this.lanternPlaceholder.position.y = -0.14;
    this.lanternMount.add(this.lanternPlaceholder);

    const flame = this.buildFlame(0.026, 0.08, 0.55);
    flame.position.set(0, -0.1, 0);
    this.lanternMount.add(flame);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffeebb,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      })
    );
    glow.position.y = -0.13;
    this.lanternMount.add(glow);

    const light = new THREE.PointLight(0xffaa44, 2.0, 8);
    light.position.set(0, -0.13, 0);
    this.lanternMount.add(light);

    return group;
  }

  /** Swap the placeholder core for the Kenney lantern model. */
  installLantern(template: THREE.Group): void {
    const model = template.clone(true);
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = (child.material as THREE.MeshStandardMaterial).clone();
        mat.emissive.setHex(0xffaa44);
        mat.emissiveIntensity = 0.22;
        child.material = mat;
      }
    });
    // normalized height 1 → ~26cm lantern hanging under the fist
    model.scale.setScalar(0.26);
    model.position.y = -0.26;
    this.lanternMount.add(model);

    this.lanternPlaceholder.visible = false;
  }

  // ─── RIGHT: open palm cupping the fire orb ────────────────────────
  private buildOrbArm(): THREE.Group {
    const group = new THREE.Group();
    this.buildArmBase(group);

    // palm up, fingers gently curled into a cup
    const hand = this.buildHand(1, 0.45, 0.55, 0.5);
    hand.position.y = 0.07;
    hand.rotation.x = -1.15;
    group.add(hand);

    this.heldOrb = new THREE.Group();
    this.heldOrb.position.set(0, 0.135, 0.055);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 8, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffaa33).multiplyScalar(2.2) })
    );
    this.heldOrb.add(core);

    const flame = this.buildFlame(0.045, 0.13, 1);
    flame.position.y = 0.075;
    this.torchFlameMats = this.flameMats.slice(-2);
    this.heldOrb.add(flame);

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
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

    this.torchLight.position.set(0, 0.15, 0.05);
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
      new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.17, 0.05 + (Math.random() - 0.5) * 0.05),
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

    for (const mat of this.flameMats) mat.uniforms.uTime!.value = time;
    this.embers.update(delta);

    this.lanternGroup.position.x = this.lanternRestX + swayX;
    this.lanternGroup.position.y = this.lanternRestY + idleBob + swayY;
    this.lanternGroup.rotation.z = 0.08 + Math.sin(time * 0.7) * 0.01;
    // the lantern swings gently on its handle
    this.lanternMount.rotation.z = Math.sin(time * 1.3) * 0.07;
    this.lanternMount.rotation.x = Math.sin(time * 1.7 + 1.0) * 0.05;

    // orb regrows after a throw
    this.orbRegrow = Math.min(1, this.orbRegrow + delta / 0.35);
    const orbScale = this.orbRegrow * this.orbRegrow * (3 - 2 * this.orbRegrow);
    this.heldOrb.scale.setScalar(Math.max(0.001, orbScale));

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
        for (const mat of this.torchFlameMats) mat.uniforms.uIntensity!.value = 1 + e * 0.9;
        this.torchLight.intensity = (0.8 + e * 1.5) * (0.3 + orbScale * 0.7);
        this.spawnEmbers(delta, 4);
        return;
      }
    }

    this.torchGroup.position.x = this.torchRestX - swayX;
    this.torchGroup.position.y = this.torchRestY + idleBob - swayY;
    this.torchGroup.position.z = this.torchRestZ;
    this.torchGroup.rotation.x = this.torchRestRotX;
    for (const mat of this.torchFlameMats) mat.uniforms.uIntensity!.value = 1;
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
