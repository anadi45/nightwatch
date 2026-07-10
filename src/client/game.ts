import { GameManager } from './engine/GameManager.js';
import { fetchInit, startRun, submitScore, fetchLeaderboard } from './api.js';
import type { PlayerStats } from '../shared/api.js';

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

const leaderboard = document.getElementById('leaderboard')!;
const lbList = document.getElementById('lb-list')!;
const lbMe = document.getElementById('lb-me')!;

const menuStats = document.getElementById('menu-stats')!;
const msCarry = document.getElementById('ms-carry')!;
const msBest = document.getElementById('ms-best')!;
const msStreak = document.getElementById('ms-streak')!;
const msRank = document.getElementById('ms-rank')!;
const msPlays = document.getElementById('ms-plays')!;

const btnStart = document.getElementById('btn-start') as HTMLButtonElement;
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement;

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    init();
  });
});

function init() {
  let bestStreak = 0;
  let carryStreak = 0;
  let playsRemaining: number | null = null; // null = logged out (uncapped)
  let starting = false;

  function renderMenuStats(stats: PlayerStats): void {
    msCarry.textContent = String(stats.carryStreak);
    msBest.textContent = String(stats.bestScore);
    msStreak.textContent = String(stats.bestStreak);
    msRank.textContent = stats.rank === null ? '—' : `#${stats.rank}`;
    msPlays.textContent = String(stats.playsRemaining ?? '∞');
    menuStats.classList.remove('hidden');
  }

  function renderPlayGate(): void {
    const out = playsRemaining !== null && playsRemaining <= 0;
    for (const btn of [btnStart, btnRestart]) {
      btn.disabled = out;
      btn.textContent = out
        ? 'No watches left — return tomorrow'
        : btn === btnStart
          ? 'Begin Watch'
          : 'Watch Again';
    }
  }

  // Ready screen meta: who is this, what's their standing, plays left
  void fetchInit().then((initRes) => {
    if (initRes?.stats) {
      carryStreak = initRes.stats.carryStreak;
      playsRemaining = initRes.stats.playsRemaining;
      renderMenuStats(initRes.stats);
      renderPlayGate();
    }
  });

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
      renderPlayGate();
      void reportRun(state.score, bestStreak, state.misses, state.streak);
    },
  });

  // The server reserves one of today's plays and hands back the streak
  // this run must start from — the run begins only if it allows it.
  async function startGame(): Promise<void> {
    if (starting || btnStart.disabled) return;
    starting = true;
    const gate = await startRun();
    starting = false;
    // null = network failure: allow a casual run rather than a dead button
    if (gate) {
      if (!gate.allowed) {
        playsRemaining = 0;
        renderPlayGate();
        return;
      }
      carryStreak = gate.carryStreak;
      playsRemaining = gate.playsRemaining;
    }
    bestStreak = carryStreak;
    readyScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    game.start(carryStreak);
  }

  // Submit the finished run, then show the refreshed all-time top list.
  // Both calls fail soft — logged-out players still see the leaderboard,
  // and a network hiccup never blocks the end screen.
  async function reportRun(
    score: number,
    streak: number,
    misses: number,
    finalStreak: number
  ): Promise<void> {
    const result = await submitScore({ score, bestStreak: streak, misses, endStreak: finalStreak });
    if (result) carryStreak = result.carryStreak;

    const board = await fetchLeaderboard();
    if (!board || board.top.length === 0) {
      leaderboard.classList.add('hidden');
      return;
    }

    lbList.innerHTML = '';
    for (const entry of board.top.slice(0, 5)) {
      const li = document.createElement('li');
      const isMe = board.me !== null && entry.username === board.me.username;
      li.className = isMe ? 'lb-row lb-row-me' : 'lb-row';
      li.innerHTML =
        `<span class="lb-rank">#${entry.rank}</span>` +
        `<span class="lb-name"></span><span class="lb-score">${entry.score}</span>`;
      li.querySelector('.lb-name')!.textContent = entry.username;
      lbList.appendChild(li);
    }

    const carryNote = carryStreak > 0 ? ` · streak of ${carryStreak} carries on` : '';
    if (board.me && board.me.rank > 5) {
      lbMe.textContent = `You: #${board.me.rank} — best ${board.me.score}${carryNote}`;
      lbMe.classList.remove('hidden');
    } else if (result?.newBest) {
      lbMe.textContent = `New personal best!${carryNote}`;
      lbMe.classList.remove('hidden');
    } else if (carryNote) {
      lbMe.textContent = `Streak of ${carryStreak} carries to your next watch`;
      lbMe.classList.remove('hidden');
    } else {
      lbMe.classList.add('hidden');
    }
    leaderboard.classList.remove('hidden');
  }

  btnStart.addEventListener('click', () => void startGame());
  btnRestart.addEventListener('click', () => void startGame());

  // Tap to fire an energy bolt toward that point
  container.addEventListener('pointerdown', (e) => {
    const rect = container.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    game.handleTap(ndcX, ndcY);
  });

  loader.classList.add('fade-out');
  setTimeout(() => loader.remove(), 500);
}
