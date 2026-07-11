import { GameManager } from './engine/GameManager.js';
import { fetchInit, startRun, submitScore, fetchLeaderboard } from './api.js';

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

  // Snapshot of the run in progress, so closing the game mid-watch (or
  // before the end-screen submit lands) still records it via keepalive.
  let runId: string | null = null;
  let runSubmitted = true; // no run yet — nothing to salvage
  let liveScore = 0;
  let liveMisses = 0;
  let liveStreak = 0;

  function renderPlayGate(): void {
    const out = playsRemaining !== null && playsRemaining <= 0;
    for (const btn of [btnStart, btnRestart]) {
      btn.disabled = out;
      btn.textContent = out
        ? 'Out of runs — back tomorrow'
        : btn === btnStart
          ? 'Start'
          : 'Play Again';
    }
  }

  // Stats display lives on the splash card; here we only need the carry
  // and the plays-left count to gate the Begin Watch button
  void fetchInit().then((initRes) => {
    if (initRes?.stats) {
      carryStreak = initRes.stats.carryStreak;
      playsRemaining = initRes.stats.playsRemaining;
      renderPlayGate();
    }
  });

  const game = new GameManager(container, {
    onStateChange(state) {
      scoreValue.textContent = String(state.score);
      streakValue.textContent = String(state.streak);
      if (state.streak > bestStreak) bestStreak = state.streak;
      liveScore = state.score;
      liveMisses = state.misses;
      liveStreak = state.streak;
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
      runId = gate.runId;
      runSubmitted = gate.runId === null; // casual runs have nothing to salvage
    }
    bestStreak = carryStreak;
    liveScore = 0;
    liveMisses = 0;
    liveStreak = carryStreak;
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
    const result = await submitScore({
      score,
      bestStreak: streak,
      misses,
      endStreak: finalStreak,
      runId,
    });
    if (result) {
      carryStreak = result.carryStreak;
      runSubmitted = true;
    }

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

    const carryNote = carryStreak > 0 ? ` · streak of ${carryStreak} still alive` : '';
    if (board.me && board.me.rank > 5) {
      lbMe.textContent = `You're #${board.me.rank} — best ${board.me.score}${carryNote}`;
      lbMe.classList.remove('hidden');
    } else if (result?.newBest) {
      lbMe.textContent = `New personal best!${carryNote}`;
      lbMe.classList.remove('hidden');
    } else if (carryNote) {
      lbMe.textContent = `Your streak of ${carryStreak} is still alive`;
      lbMe.classList.remove('hidden');
    } else {
      lbMe.classList.add('hidden');
    }
    leaderboard.classList.remove('hidden');
  }

  btnStart.addEventListener('click', () => void startGame());
  btnRestart.addEventListener('click', () => void startGame());

  // Closing the game must not lose the run: fire a keepalive submission of
  // the current standing. The server dedupes by runId, so if the normal
  // end-of-run submit also landed (or lands), only one write counts.
  window.addEventListener('pagehide', () => {
    if (runId === null || runSubmitted) return;
    runSubmitted = true;
    void submitScore(
      {
        score: liveScore,
        bestStreak,
        misses: liveMisses,
        endStreak: liveStreak,
        runId,
      },
      true
    );
  });

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
