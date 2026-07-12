import * as THREE from 'three';

// The mothership hovers directly over the spawn zone — aliens drop out of
// its glowing underbelly bay. Everything is `fog: false` (like the moon and
// sky) so the craft stays a crisp silhouette instead of dissolving into the
// heavy playfield fog. Per the art direction the hull is a near-black
// cutout; the only bright things are the violet bay, running lights and
// abduction beam, matching the aliens' own bioluminescence.

const SHIP_POS = new THREE.Vector3(0, 6.4, -15);
/** World-space Y of the underbelly bay — aliens spawn dropping from here. */
export const SHIP_BAY_Y = SHIP_POS.y - 0.7;

const HULL_MAT = new THREE.MeshBasicMaterial({ color: 0x05060c, fog: false });
const BAY_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xb069ff).multiplyScalar(2.2), // HDR — blooms
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  fog: false,
});
const LIGHT_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xcc88ff).multiplyScalar(2.4),
  fog: false,
});

export class Ship {
  readonly group: THREE.Group;
  private lightRing: THREE.Group;
  private bay: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.group.position.copy(SHIP_POS);

    // ── Lower saucer disc (wide, flattened lathe hull) ──────────────
    const discPts: THREE.Vector2[] = [];
    const seg = 14;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      // rim at t~0.5 is widest; tapers to a point at the outer edge and
      // rounds into the belly at the centre
      const r = 2.3 * Math.sin(t * Math.PI);
      const y = -0.55 * Math.cos(t * Math.PI); // -0.55 belly → +0.55 top rim
      discPts.push(new THREE.Vector2(Math.max(0.02, r), y));
    }
    const disc = new THREE.Mesh(new THREE.LatheGeometry(discPts, 40), HULL_MAT);
    this.group.add(disc);

    // ── Upper command dome ──────────────────────────────────────────
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      HULL_MAT
    );
    dome.position.y = 0.5;
    this.group.add(dome);

    // ── Underbelly bay: the glowing hatch aliens emerge from ────────
    // A flattened emissive blob dropping just below the belly, so it reads
    // as a glowing hatch even at the grazing under-view angle. Blooms.
    this.bay = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 12), BAY_MAT);
    this.bay.scale.set(1, 0.42, 1);
    this.bay.position.y = -0.62;
    this.group.add(this.bay);
    // torus lip framing the hatch
    const bayLip = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 8, 28), LIGHT_MAT);
    bayLip.rotation.x = Math.PI / 2;
    bayLip.position.y = -0.55;
    this.group.add(bayLip);

    // ── Running lights around the rim (rotate slowly) ───────────────
    this.lightRing = new THREE.Group();
    const lightGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const COUNT = 12;
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2;
      const light = new THREE.Mesh(lightGeo, LIGHT_MAT);
      light.position.set(Math.cos(a) * 2.25, 0.02, Math.sin(a) * 2.25);
      this.lightRing.add(light);
    }
    this.group.add(this.lightRing);

    // ── Abduction beam falling to the spawn zone ────────────────────
    // Open cone, wider at the bottom, additive so it reads as light.
    this.beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x9a55ff).multiplyScalar(1.3),
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beamH = SHIP_BAY_Y; // reach from bay down to the ground (y≈0)
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, beamH, 24, 1, true), this.beamMat);
    // default cone: apex at +h/2, wide base at −h/2 — already narrow at the
    // bay (top) and spreading to the ground (bottom), no rotation needed
    beam.position.y = -0.7 - beamH / 2;
    this.group.add(beam);
  }

  update(time: number): void {
    // slow hover bob + gentle sway
    this.group.position.y = SHIP_POS.y + Math.sin(time * 0.6) * 0.18;
    this.group.rotation.z = Math.sin(time * 0.4) * 0.02;
    // running lights orbit; bay + beam pulse together
    this.lightRing.rotation.y = time * 0.5;
    const pulse = 0.7 + 0.3 * Math.sin(time * 2.0);
    (this.bay.material as THREE.MeshBasicMaterial).opacity = 0.9 * pulse;
    this.beamMat.opacity = 0.045 + 0.025 * pulse;
  }
}
