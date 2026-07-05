import * as THREE from 'three';
import type { ParticleSystem } from './effects/Particles';

const SPEED = 16;
const MAX_AGE = 1.8;

// shared static resources — never mutated, never disposed per-instance
const CORE_GEO = new THREE.SphereGeometry(0.09, 8, 8);
const GLOW_GEO = new THREE.SphereGeometry(0.18, 8, 8);
const CORE_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xffaa33).multiplyScalar(2.5), // blooms hard
});
const GLOW_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0xff6611).multiplyScalar(1.4),
  transparent: true,
  opacity: 0.3,
  blending: THREE.AdditiveBlending,
});

const TRAIL_COLOR = new THREE.Color(0xff7722).multiplyScalar(2.0);
const HIT_BURST_COLOR = new THREE.Color(0xffcc55).multiplyScalar(2.2);
const FIZZLE_COLOR = new THREE.Color(0xcc5511).multiplyScalar(1.3);

/**
 * Thrown projectile: HDR core + glow (bloom does the fire halo, no
 * PointLight), ember trail through the shared fx system. Straight-line
 * flight along the aim ray — leading weaving ghosts is the skill.
 */
export class Fireball {
  readonly mesh: THREE.Group;
  private velocity: THREE.Vector3;
  private fx: ParticleSystem;
  private core: THREE.Mesh;
  private age = 0;
  private trailTimer = 0;
  private dead = false;

  constructor(start: THREE.Vector3, target: THREE.Vector3, fx: ParticleSystem) {
    this.fx = fx;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(start);
    this.velocity = target.clone().sub(start).normalize().multiplyScalar(SPEED);

    this.core = new THREE.Mesh(CORE_GEO, CORE_MAT);
    this.mesh.add(this.core);
    this.mesh.add(new THREE.Mesh(GLOW_GEO, GLOW_MAT));
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

    // rolling flicker
    const pulse = 1 + Math.sin(this.age * 30) * 0.15;
    this.core.scale.setScalar(pulse);

    // ember trail
    this.trailTimer -= delta;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.03;
      this.fx.spawn(this.mesh.position, {
        color: TRAIL_COLOR,
        velocity: new THREE.Vector3(0, 0.3, 0),
        spread: 0.4,
        drag: 0.3,
        life: 0.25,
        lifeJitter: 0.15,
        size: 0.05,
        sizeJitter: 0.03,
      });
    }
  }

  /** Flew past the field, hit the ground, or burned out. */
  hasExpired(): boolean {
    return (
      this.age > MAX_AGE || this.mesh.position.y < 0.05 || this.mesh.position.z < -24
    );
  }

  /** Burst effect — big and bright on a hit, a dim fizzle on a miss. */
  explode(hit: boolean): void {
    this.dead = true;
    this.fx.burst(this.mesh.position, hit ? 30 : 10, {
      color: hit ? HIT_BURST_COLOR : FIZZLE_COLOR,
      velocity: new THREE.Vector3(0, hit ? 1.0 : 0.4, 0),
      spread: hit ? 3.0 : 1.2,
      gravity: -1.5,
      drag: 0.25,
      life: 0.4,
      lifeJitter: 0.3,
      size: hit ? 0.06 : 0.04,
      sizeJitter: 0.03,
    });
  }
}
