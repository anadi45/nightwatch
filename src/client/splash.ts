import { requestExpandedMode, context } from '@devvit/web/client';
import type { InitResponse } from '../shared/api.js';

const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const subtitle = document.querySelector('.subtitle') as HTMLParagraphElement;

const splashStats = document.getElementById('splash-stats')!;
const spCarry = document.getElementById('sp-carry')!;
const spBest = document.getElementById('sp-best')!;
const spRank = document.getElementById('sp-rank')!;
const spPlays = document.getElementById('sp-plays')!;

playBtn.addEventListener('click', (e) => {
  requestExpandedMode(e, 'game');
});

if (context.username) {
  subtitle.textContent = `One miss breaks everything, ${context.username}.`;
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
