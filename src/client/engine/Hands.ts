import * as THREE from 'three';

// ── SHARED MATERIALS ──────────────────────────────────────────────────────
// Gun: dark matte-metal frame with teal energy elements matching the alien rim.
const SKIN_MAT    = new THREE.MeshStandardMaterial({ color: 0xc98d63, roughness: 0.9 });
const SLEEVE_MAT  = new THREE.MeshStandardMaterial({ color: 0x231a10, roughness: 1.0 });
const GUN_MAT     = new THREE.MeshStandardMaterial({ color: 0x0d1018, roughness: 0.55, metalness: 0.78 });
const GUN_SLIDE   = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.42, metalness: 0.88 });
// Teal HDR energy elements — bloom threshold is 1.0 so multiplying above it lets the
// glow bleed without a PointLight on every vent
const ENERGY_MAT  = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x00ffcc).multiplyScalar(2.0),
});
const MUZZLE_RING_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x88ffee).multiplyScalar(1.8),
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.65,
  depthWrite: false,
});

// ── FINGER SPEC ───────────────────────────────────────────────────────────
interface FingerSpec {
  x: number;
  radius: number;
  len1: number;
  len2: number;
}
const FINGERS: FingerSpec[] = [
  { x: -0.0285, radius: 0.009,  len1: 0.030, len2: 0.024 },
  { x: -0.0095, radius: 0.0105, len1: 0.037, len2: 0.030 },
  { x:  0.0095, radius: 0.0105, len1: 0.040, len2: 0.032 },
  { x:  0.0285, radius: 0.0095, len1: 0.034, len2: 0.027 },
];

/**
 * First-person two-handed gun. The weapon is a procedural sci-fi/alien
 * energy pistol — dark metal frame, teal bioluminescent vents — matching
 * the alien entity's colour language. Both hands grip it: right on the
 * handle, left bracing under the barrel.
 *
 * Public API is unchanged from the lantern/orb version so GameManager
 * doesn't need edits: throwFireball() triggers the recoil + muzzle flash,
 * installLantern() is a no-op, update(delta, time) drives the animation.
 */
export class Hands {
  private camera: THREE.PerspectiveCamera;
  private gunGroup: THREE.Group;

  private gunRestX = 0;
  private gunRestY = 0;
  private gunRestZ = 0;
  private gunRestRotX = 0.12;

  private recoilTimer   = 0;
  private flashTimer    = 0;
  private muzzleLight:  THREE.PointLight;
  private muzzleGlowMat: THREE.MeshBasicMaterial;
  private energyLight:  THREE.PointLight;

  private static readonly RECOIL_DURATION = 0.30;
  private static readonly FLASH_DURATION  = 0.09;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;

    // Muzzle flash — spikes on shoot, decays in FLASH_DURATION seconds.
    // Teal-white so it reads as an energy weapon, not fire.
    this.muzzleLight = new THREE.PointLight(0x88ffee, 0, 3.5);

    // Persistent teal energy ambient near the player's hands — replaces the
    // warm torch light from the old orb arm (stays within the 3-light budget).
    this.energyLight = new THREE.PointLight(0x00ddaa, 0.45, 2.8);

    this.gunGroup = this.buildGunAssembly();
    this.layoutGun();
    camera.add(this.gunGroup);

    // Grab the muzzle glow mesh material for opacity animation in update()
    const glowMesh = this.gunGroup.getObjectByName('muzzleGlow') as THREE.Mesh;
    this.muzzleGlowMat = glowMesh.material as THREE.MeshBasicMaterial;

    window.addEventListener('resize', () => this.layoutGun());
  }

  private layoutGun(): void {
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const z      = -0.40;
    const halfH  = Math.tan(fovRad / 2) * Math.abs(z);
    const halfW  = halfH * this.camera.aspect;

    // Classic FPS: gun slightly right of centre, lower third of the frame
    const x = halfW * 0.28;
    const y = -halfH * 0.76;

    this.gunGroup.position.set(x, y, z);
    this.gunRestX = x;
    this.gunRestY = y;
    this.gunRestZ = z;
  }

  // ── GUN + HANDS ASSEMBLY ─────────────────────────────────────────────
  private buildGunAssembly(): THREE.Group {
    const group = new THREE.Group();
    group.rotation.set(this.gunRestRotX, -0.10, 0.04);

    this.buildGunGeometry(group);
    this.buildHands(group);
    return group;
  }

  private buildGunGeometry(group: THREE.Group): void {
    // ── Frame / receiver ─────────────────────────────────────────────
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.032, 0.160), GUN_MAT);
    frame.position.set(0, 0, -0.010);
    group.add(frame);

    // Slide (runs over the frame, slightly narrower and taller)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.024, 0.118), GUN_SLIDE);
    slide.position.set(0, 0.027, -0.008);
    group.add(slide);

    // Front sight post
    const fSight = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.011, 0.005), GUN_MAT);
    fSight.position.set(0, 0.040, -0.058);
    group.add(fSight);

    // Rear sight — two posts with gap between
    for (const sx of [-1, 1]) {
      const rPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.009, 0.004), GUN_MAT);
      rPost.position.set(sx * 0.008, 0.040, 0.054);
      group.add(rPost);
    }

    // ── Barrel ───────────────────────────────────────────────────────
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.008, 0.140, 7),
      GUN_SLIDE
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, -0.108);
    group.add(barrel);

    // Muzzle collar / compensator stub
    const muzzleCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.024, 7),
      GUN_MAT
    );
    muzzleCollar.rotation.x = Math.PI / 2;
    muzzleCollar.position.set(0, 0, -0.190);
    group.add(muzzleCollar);

    // ── Grip / handle ─────────────────────────────────────────────────
    const grip = new THREE.Group();
    grip.position.set(0, -0.018, 0.050);
    grip.rotation.x = 0.20; // angles the grip back naturally
    const gripBody = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.088, 0.032), GUN_MAT);
    gripBody.position.y = -0.044;
    grip.add(gripBody);
    // Grip texture ridges (raised rear strips)
    for (const gy of [-0.022, -0.050, -0.072]) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.007, 0.005), GUN_SLIDE);
      ridge.position.set(0, gy, -0.018);
      grip.add(ridge);
    }
    group.add(grip);

    // Trigger guard
    const gBottom = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.004, 0.048), GUN_MAT);
    gBottom.position.set(0, -0.025, 0.010);
    group.add(gBottom);
    const gFront = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 0.004), GUN_MAT);
    gFront.position.set(0, -0.014, -0.014);
    group.add(gFront);

    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.019, 0.009), GUN_SLIDE);
    trigger.rotation.x = 0.28;
    trigger.position.set(0, -0.013, 0.005);
    group.add(trigger);

    // Picatinny-ish rail under the barrel (detail strip)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.006, 0.080), GUN_SLIDE);
    rail.position.set(0, -0.018, -0.055);
    group.add(rail);

    // ── Teal energy elements (alien power cell language) ────────────
    // Side vent strips on the slide
    for (const sx of [-1, 1]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.010, 0.044), ENERGY_MAT);
      vent.position.set(sx * 0.012, 0.024, -0.006);
      group.add(vent);
    }
    // Rear core window in the slide (visible from above)
    const coreWindow = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.003, 0.020), ENERGY_MAT);
    coreWindow.position.set(0, 0.040, 0.046);
    group.add(coreWindow);
    // Small energy indicator on the grip
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.003), ENERGY_MAT);
    indicator.position.set(0.012, -0.028, 0.067);
    group.add(indicator);

    // Muzzle ring (teal bloom ring at the barrel tip)
    const muzzleRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.011, 0.003, 5, 10),
      MUZZLE_RING_MAT
    );
    muzzleRing.rotation.x = Math.PI / 2;
    muzzleRing.position.set(0, 0, -0.202);
    group.add(muzzleRing);

    // Muzzle flash glow (invisible until shoot, decays quickly)
    const muzzleGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 6, 6),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xaaffee).multiplyScalar(3.5),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    muzzleGlow.name = 'muzzleGlow';
    muzzleGlow.position.set(0, 0, -0.215);
    group.add(muzzleGlow);

    // Muzzle flash point light — parked at barrel tip
    this.muzzleLight.position.set(0, 0, -0.26);
    group.add(this.muzzleLight);

    // Persistent energy ambient — sits at the frame centre
    this.energyLight.position.set(0, 0.01, 0);
    group.add(this.energyLight);
  }

  private buildHands(group: THREE.Group): void {
    // ── Right hand (dominant): grips the handle ──────────────────────
    const rArm = new THREE.Group();
    this.buildArmBase(rArm);
    const rHand = this.buildHand(1, 1.25, 1.35, 1.05);
    rHand.position.y = 0.07;
    rHand.rotation.x = -0.52;
    rArm.add(rHand);
    // Position arm so fist wraps around the grip handle
    rArm.position.set(0.010, -0.098, 0.054);
    rArm.rotation.set(-0.88, 0.04, 0.09);
    group.add(rArm);

    // ── Left hand (support): braces under the barrel ─────────────────
    const lArm = new THREE.Group();
    this.buildArmBase(lArm);
    const lHand = this.buildHand(-1, 1.10, 1.22, 0.80);
    lHand.position.y = 0.07;
    lHand.rotation.x = -0.38;
    lArm.add(lHand);
    // Position arm so hand cups under the front of the frame
    lArm.position.set(-0.018, -0.082, -0.082);
    lArm.rotation.set(-0.95, -0.12, -0.09);
    group.add(lArm);
  }

  // ── HAND GEOMETRY (unchanged from original) ───────────────────────────
  private buildFinger(spec: FingerSpec, curl1: number, curl2: number): THREE.Group {
    const knuckle = new THREE.Group();
    knuckle.position.set(spec.x, 0.095, 0.004);
    knuckle.rotation.x = curl1;

    const seg1 = new THREE.Mesh(
      new THREE.CapsuleGeometry(spec.radius, spec.len1, 3, 6),
      SKIN_MAT
    );
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

  private buildHand(side: 1 | -1, curl1: number, curl2: number, thumbCurl: number): THREE.Group {
    const hand = new THREE.Group();

    const palm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.036, 0.05, 4, 8),
      SKIN_MAT
    );
    palm.scale.set(1.25, 1, 0.55);
    palm.position.y = 0.048;
    hand.add(palm);

    for (const spec of FINGERS) {
      hand.add(this.buildFinger(spec, curl1, curl2));
    }

    const thumbRoot = new THREE.Group();
    thumbRoot.position.set(side * -0.044, 0.035, 0.012);
    thumbRoot.rotation.set(thumbCurl, 0, side * -0.9);
    const thumb1 = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0115, 0.032, 3, 6),
      SKIN_MAT
    );
    thumb1.position.y = 0.016;
    thumbRoot.add(thumb1);
    const thumbJoint = new THREE.Group();
    thumbJoint.position.y = 0.032;
    thumbJoint.rotation.x = thumbCurl * 0.8;
    const thumb2 = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.01, 0.026, 3, 6),
      SKIN_MAT
    );
    thumb2.position.y = 0.013;
    thumbJoint.add(thumb2);
    thumbRoot.add(thumbJoint);
    hand.add(thumbRoot);

    return hand;
  }

  private buildArmBase(group: THREE.Group): void {
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.062, 0.17, 8),
      SLEEVE_MAT
    );
    sleeve.position.y = -0.1;
    group.add(sleeve);

    const cuff = new THREE.Mesh(
      new THREE.TorusGeometry(0.052, 0.008, 5, 10),
      SLEEVE_MAT
    );
    cuff.position.y = -0.02;
    cuff.rotation.x = Math.PI / 2;
    group.add(cuff);

    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.035, 0.1, 4, 8),
      SKIN_MAT
    );
    forearm.position.y = 0.02;
    group.add(forearm);
  }

  // ── PUBLIC API ────────────────────────────────────────────────────────
  /** No-op: gun replaces the lantern so no model swap is needed. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  installLantern(_template: THREE.Group): void {}

  /** Trigger recoil + muzzle flash; GameManager still spawns the Fireball. */
  throwFireball(): void {
    this.recoilTimer  = 0.001;
    this.flashTimer   = Hands.FLASH_DURATION;
    this.muzzleLight.intensity  = 4.0;
    this.muzzleGlowMat.opacity  = 1.0;
  }

  update(delta: number, time: number): void {
    const idleBob = Math.sin(time * 1.5) * 0.004;
    const swayX   = Math.sin(time * 0.9) * 0.003;
    const swayY   = Math.sin(time * 1.8) * 0.003;

    // Muzzle flash decay
    if (this.flashTimer > 0) {
      this.flashTimer -= delta;
      const fade = Math.max(0, this.flashTimer / Hands.FLASH_DURATION);
      this.muzzleLight.intensity  = 4.0 * fade;
      this.muzzleGlowMat.opacity  = fade * 0.88;
    }

    // Energy light breathes slightly
    this.energyLight.intensity = 0.38 + Math.sin(time * 2.1) * 0.07;

    // Recoil: brief upward kick that springs back
    if (this.recoilTimer > 0) {
      this.recoilTimer += delta;
      if (this.recoilTimer >= Hands.RECOIL_DURATION) {
        this.recoilTimer = 0;
      } else {
        const t     = this.recoilTimer / Hands.RECOIL_DURATION;
        const kick  = t < 0.22 ? t / 0.22 : 1 - (t - 0.22) / 0.78;
        const e     = Math.sin(kick * Math.PI * 0.5);
        this.gunGroup.position.y = this.gunRestY + e * 0.020 + idleBob;
        this.gunGroup.position.z = this.gunRestZ + e * 0.028;
        this.gunGroup.rotation.x = this.gunRestRotX + e * 0.18;
        return;
      }
    }

    // Idle sway
    this.gunGroup.position.x = this.gunRestX + swayX;
    this.gunGroup.position.y = this.gunRestY + idleBob + swayY;
    this.gunGroup.position.z = this.gunRestZ;
    this.gunGroup.rotation.x = this.gunRestRotX;
  }

  dispose(): void {
    this.gunGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const m of child.material) m.dispose();
        } else {
          (child.material as THREE.Material).dispose();
        }
      }
    });
  }
}
