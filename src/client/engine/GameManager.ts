import * as THREE from 'three';
import { World } from './World.js';
import { Creature, CreatureType, MovementPattern } from './Creature.js';
import { Hands } from './Hands.js';

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
const FRIENDLY_SPEED_MULT = 1.5;
const SPAWN_Z_MIN = -18;
const SPAWN_Z_MAX = -12;
const TARGET_Z = 4;
const SPEED_PENALTY = 0.15;

const LANES = [-2.2, -1.1, 0, 1.1, 2.2];

export class GameManager {
  private world: World;
  private hands: Hands;
  private callbacks: GameCallbacks;
  private state: GameState;
  private creatures: Creature[] = [];
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

  start(): void {
    this.state = this.freshState();
    this.creatures.forEach((c) => {
      this.world.scene.remove(c.mesh);
      c.dispose();
    });
    this.creatures = [];
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

    this.hands.thrustTorch();

    this.pointer.set(ndcX, ndcY);
    this.raycaster.setFromCamera(this.pointer, this.world.camera);

    // Build map of creature groups for hit detection
    const groupToCreature = new Map<THREE.Object3D, Creature>();
    const targets: THREE.Object3D[] = [];
    for (const c of this.creatures) {
      if (c.isApproaching()) {
        groupToCreature.set(c.mesh, c);
        targets.push(c.mesh);
      }
    }

    const intersects = this.raycaster.intersectObjects(targets, true);
    if (intersects.length === 0) return;

    // Walk up the parent chain to find the creature group
    let hitObj: THREE.Object3D | null = intersects[0].object;
    let creature: Creature | undefined;
    while (hitObj) {
      creature = groupToCreature.get(hitObj);
      if (creature) break;
      hitObj = hitObj.parent;
    }
    if (!creature) return;

    if (creature.type === 'zombie') {
      creature.disintegrate();
      this.state.score++;
      this.state.streak++;
      this.state.consecutiveMisses = 0;
      this.state.creaturesHandled++;
      this.currentSpeed = BASE_SPEED;
    } else {
      creature.flashTorch();
      this.state.streak = 0;
    }

    this.callbacks.onStateChange({ ...this.state });
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
    const type: CreatureType = Math.random() > 0.5 ? 'human' : 'zombie';
    const lane = this.pickLane();
    const spawnZ = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN);

    const speed = type === 'human'
      ? this.currentSpeed * FRIENDLY_SPEED_MULT
      : this.currentSpeed;
    const pattern: MovementPattern = type === 'human'
      ? 'straight'
      : this.pickPattern();

    const creature = new Creature({
      type,
      speed,
      spawnZ,
      targetZ: TARGET_Z,
      spawnX: LANES[lane],
      pattern,
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
    this.world.update();

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
        if (creature.type === 'zombie') {
          this.state.misses++;
          this.state.consecutiveMisses++;
          this.state.streak = 0;
          this.currentSpeed += SPEED_PENALTY * this.state.consecutiveMisses;
          creature.reachPlayer();
        } else {
          creature.peacefulVanish();
        }
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
