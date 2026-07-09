import { GameManager } from './engine/GameManager.js';

const loader = document.getElementById('loader')!;
const container = document.getElementById('game-container')!;
const readyScreen = document.getElementById('ready-screen')!;
const endScreen = document.getElementById('end-screen')!;
const hud = document.getElementById('hud')!;

const scoreValue = document.getElementById('score-value')!;
const timerValue = document.getElementById('timer-value')!;
const streakValue = document.getElementById('streak-value')!;

const endScore = document.getElementById('end-score')!;
const endStreak = document.getElementById('end-streak')!;
const endMisses = document.getElementById('end-misses')!;
const endTotal = document.getElementById('end-total')!;

const btnStart = document.getElementById('btn-start')!;
const btnRestart = document.getElementById('btn-restart')!;

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    init();
  });
});

function init() {
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
    game.start();
  }

  btnStart.addEventListener('click', startGame);
  btnRestart.addEventListener('click', startGame);

  // Tap to hurl a fireball toward that point
  container.addEventListener('pointerdown', (e) => {
    const rect = container.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    game.handleTap(ndcX, ndcY);
  });

  loader.classList.add('fade-out');
  setTimeout(() => loader.remove(), 500);
}
