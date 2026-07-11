import * as THREE from 'three';
import { World } from './World.js';
import { Creature, MovementPattern } from './Creature.js';
import { Hands } from './Hands.js';
import { Fireball } from './Fireball.js';
import { ParticleSystem } from './effects/Particles.js';

export type GamePhase = 'ready' | 'playing' | 'ended';

interface GameState {
  phase: GamePhase;
  score: number;
  misses: number;
  streak: number;
  consecutiveMisses: number;
  timeRemaining: number;
  creaturesHandled: number;
}

interface GameCallbacks {
  onStateChange: (state: GameState) => void;
  onTimerTick: (timeRemaining: number) => void;
  onGameEnd: (state: GameState) => void;
}

const WATCH_DURATION = 60;
const BASE_SPEED = 1.4;
const SPAWN_Z_MIN = -18;
const SPAWN_Z_MAX = -12;
const TARGET_Z = 4;
const SPEED_PENALTY = 0.15;
// Consecutive reaches speed up NEW spawns linearly, hard-capped — the old
// accumulating penalty grew quadratically and spiralled unwinnably fast
const MAX_SPEED = BASE_SPEED * 1.5;
const FIREBALL_HIT_RADIUS = 0.75;

// Must stay inside Creature's X_BOUND (1.4) — the fence line is at x ±2
const LANES = [-1.3, -0.65, 0, 0.65, 1.3];

export class GameManager {
  private world: World;
  private hands: Hands;
  private fx: ParticleSystem;
  private callbacks: GameCallbacks;
  private state: GameState;
  private creatures: Creature[] = [];
  private fireballs: Fireball[] = [];
  private hitCenter = new THREE.Vector3();
  private spawnTimer = 0;
  private spawnInterval = 2;
  private lastTime = 0;
  private currentSpeed = BASE_SPEED;
  private animFrameId = 0;
  private lastDisplayedSec = 0;
  private lastLane = 2;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.world = new World(container);
    this.hands = new Hands(this.world.camera);
    this.fx = new ParticleSystem(300, 0.06);
    this.world.scene.add(this.fx.points);
    this.callbacks = callbacks;
    this.state = this.freshState();
    this.lastTime = performance.now();
    this.loop();
  }

  private freshState(): GameState {
    return {
      phase: 'ready',
      score: 0,
      misses: 0,
      streak: 0,
      consecutiveMisses: 0,
      timeRemaining: WATCH_DURATION,
      creaturesHandled: 0,
    };
  }

  /** @param initialStreak streak carried in from previous watches — any miss still resets to 0 */
  start(initialStreak = 0): void {
    this.state = this.freshState();
    this.state.streak = initialStreak;
    this.creatures.forEach((c) => {
      this.world.scene.remove(c.mesh);
      c.dispose();
    });
    this.creatures = [];
    this.fireballs.forEach((fb) => this.world.scene.remove(fb.mesh));
    this.fireballs = [];
    this.currentSpeed = BASE_SPEED;
    this.spawnTimer = 0;
    this.spawnInterval = 2;
    this.lastLane = 2;
    this.lastDisplayedSec = WATCH_DURATION;
    this.state.phase = 'playing';
    this.lastTime = performance.now();
    this.callbacks.onStateChange({ ...this.state });
    this.spawnCreature();
  }

  handleTap(ndcX: number, ndcY: number): void {
    if (this.state.phase !== 'playing') return;

    this.hands.throwFireball();

    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.world.camera);

    // Aim assist: if the tap ray crosses a ghost right now, aim at that
    // exact point — the ghost can still drift out of the way in flight.
    const targets: THREE.Object3D[] = [];
    for (const c of this.creatures) {
      if (c.isApproaching()) targets.push(c.mesh);
    }
    const intersects = this.raycaster.intersectObjects(targets, true);
    const aim =
      intersects.length > 0
        ? intersects[0].point
        : this.raycaster.ray.at(20, new THREE.Vector3());

    // launch from the pistol's muzzle tip so the tracer reads as coming
    // out of the barrel, wherever the responsive layout put the gun
    const start = this.hands.getMuzzleWorldPosition(new THREE.Vector3());
    const fireball = new Fireball(start, aim, this.fx);
    this.fireballs.push(fireball);
    this.world.scene.add(fireball.mesh);
  }

  private updateFireballs(delta: number, scoring: boolean): void {
    if (this.fireballs.length === 0) return;
    let stateChanged = false;

    for (const fb of this.fireballs) {
      fb.update(delta);

      for (const c of this.creatures) {
        if (!c.isApproaching()) continue;
        c.getHitCenter(this.hitCenter);
        if (fb.position.distanceToSquared(this.hitCenter) < FIREBALL_HIT_RADIUS ** 2) {
          c.disintegrate();
          fb.explode(true);
          if (scoring) {
            this.state.score++;
            this.state.streak++;
            this.state.consecutiveMisses = 0;
            this.state.creaturesHandled++;
            this.currentSpeed = BASE_SPEED;
            stateChanged = true;
          }
          break;
        }
      }

      if (!fb.isDead() && fb.hasExpired()) {
        fb.explode(false);
        if (scoring) {
          this.state.streak = 0;
          this.state.misses++;
          stateChanged = true;
        }
      }
    }

    this.fireballs = this.fireballs.filter((fb) => {
      if (fb.isDead()) {
        this.world.scene.remove(fb.mesh);
        return false;
      }
      return true;
    });

    if (stateChanged) this.callbacks.onStateChange({ ...this.state });
  }

  private pickLane(): number {
    let lane: number;
    do {
      lane = Math.floor(Math.random() * LANES.length);
    } while (lane === this.lastLane && LANES.length > 1);
    this.lastLane = lane;
    return lane;
  }

  private pickPattern(): MovementPattern {
    const elapsed = WATCH_DURATION - this.state.timeRemaining;
    if (elapsed < 8) {
      return Math.random() < 0.6 ? 'straight' : 'weave';
    }
    if (elapsed < 25) {
      const r = Math.random();
      if (r < 0.3) return 'straight';
      if (r < 0.6) return 'weave';
      if (r < 0.85) return 'zigzag';
      return 'flank';
    }
    const r = Math.random();
    if (r < 0.15) return 'straight';
    if (r < 0.4) return 'weave';
    if (r < 0.7) return 'zigzag';
    return 'flank';
  }

  private spawnCreature(): void {
    const lane = this.pickLane();
    const spawnZ = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN);
    const pattern: MovementPattern = this.pickPattern();

    const creature = new Creature({
      speed: this.currentSpeed,
      spawnZ,
      targetZ: TARGET_Z,
      spawnX: LANES[lane],
      pattern,
      fx: this.fx,
    });

    this.creatures.push(creature);
    this.world.scene.add(creature.mesh);
  }

  private loop = (): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.hands.update(delta, now * 0.001);
    this.world.update(now * 0.001);
    this.fx.update(delta);
    this.updateFireballs(delta, this.state.phase === 'playing');

    if (this.state.phase === 'playing') {
      this.state.timeRemaining -= delta;
      if (this.state.timeRemaining <= 0) {
        this.state.timeRemaining = 0;
        this.endGame();
      } else {
        this.tickGame(delta);
      }
    }

    this.world.render();
  };

  private tickGame(delta: number): void {
    const newSec = Math.ceil(this.state.timeRemaining);
    if (newSec !== this.lastDisplayedSec) {
      this.lastDisplayedSec = newSec;
      this.callbacks.onTimerTick(this.state.timeRemaining);
    }

    this.spawnTimer += delta;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(1.2, this.spawnInterval - 0.06);
      this.spawnCreature();
    }

    for (const creature of this.creatures) {
      creature.update(delta);

      if (creature.isAlive() && !creature.wasHandled() && creature.hasReachedTarget()) {
        this.state.misses++;
        this.state.consecutiveMisses++;
        this.state.streak = 0;
        this.currentSpeed = Math.min(
          BASE_SPEED + SPEED_PENALTY * this.state.consecutiveMisses,
          MAX_SPEED
        );
        creature.reachPlayer();
        this.state.creaturesHandled++;
        this.callbacks.onStateChange({ ...this.state });
      }
    }

    this.creatures = this.creatures.filter((c) => {
      if (!c.isAlive()) {
        this.world.scene.remove(c.mesh);
        c.dispose();
        return false;
      }
      return true;
    });
  }

  private endGame(): void {
    this.state.phase = 'ended';
    this.callbacks.onStateChange({ ...this.state });
    this.callbacks.onGameEnd({ ...this.state });
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
    this.hands.dispose();
  }
}
