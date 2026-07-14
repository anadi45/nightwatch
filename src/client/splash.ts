import { requestExpandedMode, context } from '@devvit/web/client';
import type { InitResponse } from '../shared/api.js';
import { fetchLeaderboard } from './api.js';

const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const subtitle = document.querySelector('.subtitle') as HTMLParagraphElement;

const splashStats = document.getElementById('splash-stats')!;
const spCarry = document.getElementById('sp-carry')!;
const spBest = document.getElementById('sp-best')!;
const spRank = document.getElementById('sp-rank')!;
const spPlays = document.getElementById('sp-plays')!;

const splashContainer = document.getElementById('splash-container')!;
const leaderboardBtn = document.getElementById('leaderboard-btn') as HTMLButtonElement;
const leaderboardClose = document.getElementById('leaderboard-close') as HTMLButtonElement;
const leaderboardScreen = document.getElementById('leaderboard-screen')!;
const spLbList = document.getElementById('sp-lb-list')!;
const spLbMe = document.getElementById('sp-lb-me')!;

playBtn.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

// Lets a viewer check the full board straight from the feed card, no run
// required — swaps to a dedicated full-screen view rather than a panel.
leaderboardBtn.addEventListener('click', () => void openLeaderboard());
leaderboardClose.addEventListener('click', () => {
  leaderboardScreen.classList.add('hidden');
  splashContainer.classList.remove('hidden');
});

async function openLeaderboard(): Promise<void> {
  leaderboardBtn.disabled = true;
  const board = await fetchLeaderboard();
  leaderboardBtn.disabled = false;
  if (!board || board.top.length === 0) return;

  spLbList.innerHTML = '';
  for (const entry of board.top) {
    const li = document.createElement('li');
    const isMe = board.me !== null && entry.username === board.me.username;
    li.className = isMe ? 'lb-row lb-row-me' : 'lb-row';
    li.innerHTML =
      `<span class="lb-rank">#${entry.rank}</span>` +
      `<span class="lb-name"></span><span class="lb-score">${entry.score}</span>`;
    li.querySelector('.lb-name')!.textContent = entry.username;
    spLbList.appendChild(li);
  }

  if (board.me && board.me.rank > board.top.length) {
    spLbMe.textContent = `You're #${board.me.rank} — best ${board.me.score}`;
    spLbMe.classList.remove('hidden');
  } else {
    spLbMe.classList.add('hidden');
  }

  splashContainer.classList.add('hidden');
  leaderboardScreen.classList.remove('hidden');
}

if (context.username) {
  subtitle.textContent = `The dark is waiting, ${context.username}.`;
}

// Player standing right on the feed card — fail soft: the splash must
// render fine for logged-out viewers or when the request doesn't land.
async function refreshStats(): Promise<void> {
  try {
    const res = await fetch('/api/init');
    if (!res.ok) return;
    const init = (await res.json()) as InitResponse;
    if (!init.stats) return;
    spCarry.textContent = String(init.stats.carryStreak);
    spBest.textContent = String(init.stats.bestScore);
    spRank.textContent = init.stats.rank === null ? '—' : `#${init.stats.rank}`;
    spPlays.textContent = String(init.stats.playsRemaining ?? '∞');
    splashStats.classList.remove('hidden');
  } catch {
    // feed card stays minimal
  }
}

void refreshStats();

// The splash isn't reloaded when the player closes the expanded game view,
// so refresh whenever the card becomes visible again — that's the moment
// the just-finished watch's numbers need to show up.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshStats();
});
window.addEventListener('pageshow', () => void refreshStats());
