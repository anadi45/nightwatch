import * as THREE from 'three';
import type { ParticleSystem } from './effects/Particles';

const SPEED = 26;
const MAX_AGE = 1.2;

// Bolt proportions — local +z is the flight axis, meshes stretch along it.
// Slimmer and hotter than the first pass: a plasma round, not a fireball.
const CORE_STRETCH = 4.4;
const SHEATH_STRETCH = 3.4;
const HALO_STRETCH = 2.2;
const HELIX_RADIUS = 0.06;
const HELIX_SPEED = 34;

// shared static resources — never mutated, never disposed per-instance
const CORE_GEO = new THREE.SphereGeometry(0.034, 10, 10);
const SHEATH_GEO = new THREE.SphereGeometry(0.062, 10, 10);
const HALO_GEO = new THREE.SphereGeometry(0.125, 8, 8);
const CORE_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xccfff2).multiplyScalar(3.0), // white-hot, blooms hard
});
const SHEATH_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x00ffcc).multiplyScalar(1.7),
  transparent: true,
  opacity: 0.55,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
const HALO_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x00ddaa).multiplyScalar(1.2),
  transparent: true,
  opacity: 0.16,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const TRACER_COLOR = new THREE.Color(0x33ffd8).multiplyScalar(1.8);
const HELIX_COLOR = new THREE.Color(0x00e6bb).multiplyScalar(1.5);
const SPARK_COLOR = new THREE.Color(0xbbfff0).multiplyScalar(2.4);
const HIT_FLASH_COLOR = new THREE.Color(0x8dffe6).multiplyScalar(2.4);
const HIT_RING_COLOR = new THREE.Color(0x00ddaa).multiplyScalar(1.8);
const FIZZLE_COLOR = new THREE.Color(0x1f9c82).multiplyScalar(1.1);

const FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tmpSpawn = new THREE.Vector3();

/**
 * Fired energy bolt (class name predates the pistol): white-hot elongated
 * core inside a teal plasma sheath + wide halo (bloom does the glow, no
 * PointLight). Leaves a fading tracer line and a twin ion helix coiling
 * around the flight path through the shared fx system. Straight-line
 * flight along the aim ray — leading weaving aliens is the skill.
 */
export class Fireball {
  readonly mesh: THREE.Group;
  private velocity: THREE.Vector3;
  private dir: THREE.Vector3;
  private side: THREE.Vector3;
  private up: THREE.Vector3;
  private fx: ParticleSystem;
  private core: THREE.Mesh;
  private sheath: THREE.Mesh;
  private age = 0;
  private trailTimer = 0;
  private sparkTimer = 0.05;
  private dead = false;

  constructor(start: THREE.Vector3, target: THREE.Vector3, fx: ParticleSystem) {
    this.fx = fx;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(start);
    this.dir = target.clone().sub(start).normalize();
    this.velocity = this.dir.clone().multiplyScalar(SPEED);

    // orient the bolt along its flight path
    this.mesh.quaternion.setFromUnitVectors(FORWARD, this.dir);

    // perpendicular frame for the ion helix
    this.side = new THREE.Vector3().crossVectors(this.dir, WORLD_UP);
    if (this.side.lengthSq() < 1e-4) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up = new THREE.Vector3().crossVectors(this.side, this.dir);

    this.core = new THREE.Mesh(CORE_GEO, CORE_MAT);
    this.core.scale.set(1, 1, CORE_STRETCH);
    this.mesh.add(this.core);
    this.sheath = new THREE.Mesh(SHEATH_GEO, SHEATH_MAT);
    this.sheath.scale.set(1, 1, SHEATH_STRETCH);
    this.mesh.add(this.sheath);
    const halo = new THREE.Mesh(HALO_GEO, HALO_MAT);
    halo.scale.set(1, 1, HALO_STRETCH);
    this.mesh.add(halo);
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  isDead(): boolean {
    return this.dead;
  }

  update(delta: number): void {
    if (this.dead) return;
    this.age += delta;
    this.mesh.position.addScaledVector(this.velocity, delta);

    // grows out of the muzzle over the first frames
    this.mesh.scale.setScalar(Math.min(1, this.age / 0.07));

    // energy crackle — core and sheath jitter out of phase
    const corePulse = 1 + Math.sin(this.age * 52) * 0.1;
    this.core.scale.set(
      corePulse,
      corePulse,
      CORE_STRETCH * (1 + Math.sin(this.age * 34) * 0.06)
    );
    const sheathPulse = 1 + Math.sin(this.age * 47 + 1.7) * 0.09;
    this.sheath.scale.set(sheathPulse, sheathPulse, SHEATH_STRETCH);

    // tracer line + twin ion helix
    this.trailTimer -= delta;
    if (this.trailTimer <= 0) {
      // faster bolt → tighter spawn interval keeps the trail continuous
      this.trailTimer = 0.012;

      // afterimage hanging on the flight line — reads as a beam from behind
      tmpSpawn.copy(this.mesh.position).addScaledVector(this.dir, -0.12);
      this.fx.spawn(tmpSpawn, {
        color: TRACER_COLOR,
        life: 0.14,
        lifeJitter: 0.05,
        size: 0.05,
        sizeJitter: 0.015,
      });

      // two motes coiling around the path, opposite phases
      const a = this.age * HELIX_SPEED;
      for (let phase = 0; phase < 2; phase++) {
        const angle = a + phase * Math.PI;
        tmpSpawn
          .copy(this.mesh.position)
          .addScaledVector(this.side, Math.cos(angle) * HELIX_RADIUS)
          .addScaledVector(this.up, Math.sin(angle) * HELIX_RADIUS);
        this.fx.spawn(tmpSpawn, {
          color: HELIX_COLOR,
          life: 0.18,
          lifeJitter: 0.07,
          size: 0.03,
          sizeJitter: 0.012,
        });
      }
    }

    // occasional white-hot fleck spitting off the core
    this.sparkTimer -= delta;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = 0.07 + Math.random() * 0.06;
      this.fx.spawn(this.mesh.position, {
        color: SPARK_COLOR,
        spread: 0.9,
        drag: 0.3,
        gravity: -0.6,
        life: 0.25,
        lifeJitter: 0.15,
        size: 0.035,
        sizeJitter: 0.02,
      });
    }
  }

  /** Flew past the field, hit the ground, or burned out. */
  hasExpired(): boolean {
    return (
      this.age > MAX_AGE || this.mesh.position.y < 0.05 || this.mesh.position.z < -24
    );
  }

  /** Burst effect — bright plasma discharge on a hit, a dim fizzle on a miss. */
  explode(hit: boolean): void {
    this.dead = true;
    if (hit) {
      // white-hot flash at the point of impact
      this.fx.burst(this.mesh.position, 14, {
        color: HIT_FLASH_COLOR,
        spread: 1.6,
        drag: 0.12,
        life: 0.18,
        lifeJitter: 0.1,
        size: 0.09,
        sizeJitter: 0.04,
      });
      // fast expanding teal spark shell
      this.fx.burst(this.mesh.position, 20, {
        color: HIT_RING_COLOR,
        spread: 3.4,
        drag: 0.3,
        gravity: -1.0,
        life: 0.45,
        lifeJitter: 0.25,
        size: 0.05,
        sizeJitter: 0.03,
      });
      // slow rising ion motes linger after the flash
      this.fx.burst(this.mesh.position, 8, {
        color: HELIX_COLOR,
        velocity: new THREE.Vector3(0, 0.9, 0),
        spread: 0.7,
        drag: 0.5,
        gravity: 0.4,
        life: 0.8,
        lifeJitter: 0.4,
        size: 0.04,
        sizeJitter: 0.02,
      });
    } else {
      this.fx.burst(this.mesh.position, 9, {
        color: FIZZLE_COLOR,
        velocity: new THREE.Vector3(0, 0.25, 0),
        spread: 0.9,
        drag: 0.3,
        gravity: -0.8,
        life: 0.35,
        lifeJitter: 0.2,
        size: 0.04,
        sizeJitter: 0.02,
      });
    }
  }
}
