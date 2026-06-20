import { World } from './World.js';
import { Creature, CreatureType } from './Creature.js';

export type GamePhase = 'ready' | 'playing' | 'ended';
export type PlayerAction = 'lantern' | 'bell';

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
  onResult: (correct: boolean, creatureType: CreatureType) => void;
  onGameEnd: (state: GameState) => void;
}

const WATCH_DURATION = 60;
const BASE_SPEED = 1.2;
const SPAWN_Z = -20;
const TARGET_Z = 4;
const SPEED_PENALTY = 0.15;

export class GameManager {
  private world: World;
  private callbacks: GameCallbacks;
  private state: GameState;
  private creatures: Creature[] = [];
  private spawnTimer = 0;
  private spawnInterval = 3;
  private lastTime = 0;
  private currentSpeed = BASE_SPEED;
  private animFrameId = 0;
  private lastDisplayedSec = 0;

  constructor(container: HTMLElement, callbacks: GameCallbacks) {
    this.world = new World(container);
    this.callbacks = callbacks;
    this.state = this.freshState();
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
    this.spawnInterval = 3;
    this.lastDisplayedSec = WATCH_DURATION;
    this.state.phase = 'playing';
    this.lastTime = performance.now();
    this.callbacks.onStateChange({ ...this.state });
    this.spawnCreature();
    this.loop();
  }

  handleAction(action: PlayerAction): void {
    if (this.state.phase !== 'playing') return;

    const active = this.creatures.find(
      (c) => c.isAlive() && !c.hasReachedTarget()
    );
    if (!active) return;

    const correct =
      (action === 'lantern' && active.type === 'friendly') ||
      (action === 'bell' && active.type === 'threat');

    if (correct) {
      this.state.score++;
      this.state.streak++;
      this.state.consecutiveMisses = 0;
      this.currentSpeed = BASE_SPEED;
    } else {
      this.state.misses++;
      this.state.streak = 0;
      this.state.consecutiveMisses++;
      this.currentSpeed += SPEED_PENALTY * this.state.consecutiveMisses;
    }

    this.state.creaturesHandled++;
    active.dismiss();
    this.spawnCreature();
    this.spawnTimer = 0;

    this.callbacks.onResult(correct, active.type);
    this.callbacks.onStateChange({ ...this.state });
  }

  private spawnCreature(): void {
    const type: CreatureType = Math.random() > 0.5 ? 'friendly' : 'threat';
    const creature = new Creature({
      type,
      speed: this.currentSpeed,
      spawnZ: SPAWN_Z,
      targetZ: TARGET_Z,
    });
    this.creatures.push(creature);
    this.world.scene.add(creature.mesh);
  }

  private loop = (): void => {
    this.animFrameId = requestAnimationFrame(this.loop);

    const now = performance.now();
    const delta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.state.phase !== 'playing') return;

    this.state.timeRemaining -= delta;
    if (this.state.timeRemaining <= 0) {
      this.state.timeRemaining = 0;
      this.endGame();
      return;
    }

    const newSec = Math.ceil(this.state.timeRemaining);
    if (newSec !== this.lastDisplayedSec) {
      this.lastDisplayedSec = newSec;
      this.callbacks.onTimerTick(this.state.timeRemaining);
    }

    this.spawnTimer += delta;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this.spawnInterval = Math.max(1.5, this.spawnInterval - 0.05);
      this.spawnCreature();
    }

    for (const creature of this.creatures) {
      creature.setSpeed(this.currentSpeed);
      creature.update(delta);

      if (creature.isAlive() && creature.hasReachedTarget()) {
        if (creature.type === 'threat') {
          this.state.misses++;
          this.state.consecutiveMisses++;
          this.state.streak = 0;
          this.currentSpeed += SPEED_PENALTY * this.state.consecutiveMisses;
          this.callbacks.onResult(false, creature.type);
        }
        this.state.creaturesHandled++;
        creature.dismiss();
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

    this.world.update();
    this.world.render();
  };

  private endGame(): void {
    this.state.phase = 'ended';
    this.callbacks.onStateChange({ ...this.state });
    this.callbacks.onGameEnd({ ...this.state });
  }

  destroy(): void {
    cancelAnimationFrame(this.animFrameId);
  }
}
