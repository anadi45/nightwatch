import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { InitResponse, RunStartResponse } from '../../shared/api.js';
import { submitScore, getLeaderboard, getPlayerStats, startRun } from '../core/leaderboard.js';

export const api = new Hono();

// Physical caps for a 60-second watch — anything beyond these is a forged
// request, not a good run. Spawn pacing tops out well under 90 aliens.
// (Streaks carry across watches, so their cap is looser; the carry-aware
// consistency check lives in submitScore where the server knows carryIn.)
const MAX_SCORE = 90;
const MAX_MISSES = 150;
const MAX_STREAK = 10_000;

const isCount = (n: unknown, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;

// Identity comes from Devvit's request context — never from the client.
api.get('/init', async (c) => {
  const username = await reddit.getCurrentUsername();
  const response: InitResponse = {
    type: 'init',
    postId: context.postId ?? '',
    username: username ?? 'anonymous',
    loggedIn: username !== undefined,
    stats: username ? await getPlayerStats(username) : null,
  };
  return c.json(response);
});

// Reserve one of today's plays and hand the run its starting streak.
// Logged-out players play free casual runs: no cap, no carry, no scores.
api.post('/run/start', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) {
    const casual: RunStartResponse = {
      type: 'runStart',
      allowed: true,
      playsRemaining: null,
      carryStreak: 0,
    };
    return c.json(casual);
  }
  return c.json(await startRun(username));
});

api.post('/score', async (c) => {
  const username = await reddit.getCurrentUsername();
  if (!username) return c.json({ error: 'not logged in' }, 401);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !isCount(body['score'], MAX_SCORE) ||
    !isCount(body['bestStreak'], MAX_STREAK) ||
    !isCount(body['endStreak'], MAX_STREAK) ||
    !isCount(body['misses'], MAX_MISSES)
  ) {
    return c.json({ error: 'invalid run' }, 400);
  }

  const response = await submitScore(username, {
    score: body['score'] as number,
    bestStreak: body['bestStreak'] as number,
    misses: body['misses'] as number,
    endStreak: body['endStreak'] as number,
  });
  if (!response) return c.json({ error: 'invalid run' }, 400);
  return c.json(response);
});

api.get('/leaderboard', async (c) => {
  const username = await reddit.getCurrentUsername();
  return c.json(await getLeaderboard(username));
});
