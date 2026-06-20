import { GameManager } from './engine/GameManager.js';
import type { CreatureType } from './engine/Creature.js';

const container = document.getElementById('game-container')!;
const readyScreen = document.getElementById('ready-screen')!;
const endScreen = document.getElementById('end-screen')!;
const hud = document.getElementById('hud')!;

const scoreValue = document.getElementById('score-value')!;
const timerValue = document.getElementById('timer-value')!;
const streakValue = document.getElementById('streak-value')!;
const feedback = document.getElementById('feedback')!;

const endScore = document.getElementById('end-score')!;
const endStreak = document.getElementById('end-streak')!;
const endMisses = document.getElementById('end-misses')!;
const endTotal = document.getElementById('end-total')!;

const btnStart = document.getElementById('btn-start')!;
const btnRestart = document.getElementById('btn-restart')!;
const btnLantern = document.getElementById('btn-lantern')!;
const btnBell = document.getElementById('btn-bell')!;

let feedbackTimer = 0;
let bestStreak = 0;

const game = new GameManager(container, {
  onStateChange(state) {
    scoreValue.textContent = String(state.score);
    streakValue.textContent = String(state.streak);
    if (state.streak > bestStreak) bestStreak = state.streak;
  },

  onTimerTick(timeRemaining: number) {
    timerValue.textContent = String(Math.ceil(timeRemaining));
  },

  onResult(correct: boolean, _creatureType: CreatureType) {
    feedback.textContent = correct ? '✓' : '✗';
    feedback.className = correct ? 'correct' : 'wrong';
    clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => {
      feedback.className = 'hidden';
    }, 400);
  },

  onGameEnd(state) {
    hud.classList.add('hidden');
    endScreen.classList.remove('hidden');
    endScore.textContent = String(state.score);
    endStreak.textContent = String(bestStreak);
    endMisses.textContent = String(state.misses);
    endTotal.textContent = String(state.creaturesHandled);
  },
});

function startGame() {
  bestStreak = 0;
  readyScreen.classList.add('hidden');
  endScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  feedback.className = 'hidden';
  game.start();
}

btnStart.addEventListener('click', startGame);
btnRestart.addEventListener('click', startGame);

btnLantern.addEventListener('click', () => game.handleAction('lantern'));
btnBell.addEventListener('click', () => game.handleAction('bell'));

document.addEventListener('keydown', (e) => {
  if (e.key === 'l' || e.key === 'L' || e.key === 'ArrowLeft') {
    game.handleAction('lantern');
  } else if (e.key === 'b' || e.key === 'B' || e.key === 'ArrowRight') {
    game.handleAction('bell');
  }
});
