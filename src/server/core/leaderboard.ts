import { redis } from '@devvit/web/server';
import type {
  LeaderboardEntry,
  LeaderboardResponse,
  PlayerStats,
  RunStartResponse,
  ScoreSubmitResponse,
} from '../../shared/api.js';

// ── Redis data model ──────────────────────────────────────────────────
// lb:alltime            zset   member = username, score = best run score
// player:{username}     hash   runs, aliensDown, misses, bestScore,
//                              bestStreak, currentStreak (the carry)
// plays:{username}:{yyyy-mm-dd}  counter, expires after 48h — daily cap
//
// The zset keeps only each player's best (zAdd overwrites the member's
// score, so we guard with zScore first). Stats accumulate across runs.
// The streak carries across watches: a run starts from currentStreak and
// writes its end-of-run streak back — only a miss ever resets it.

const LB_KEY = 'lb:alltime';
const TOP_N = 10;
export const MAX_PLAYS_PER_DAY = 2;

const playerKey = (username: string): string => `player:${username}`;

const playsKey = (username: string): string => {
  const day = new Date().toISOString().slice(0, 10); // UTC yyyy-mm-dd
  return `plays:${username}:${day}`;
};

async function getPlaysUsedToday(username: string): Promise<number> {
  return Number((await redis.get(playsKey(username))) ?? '0');
}

async function getCarryStreak(username: string): Promise<number> {
  return Number((await redis.hGetAll(playerKey(username)))['currentStreak'] ?? '0');
}

/** Everything the splash card shows for a logged-in player. */
export async function getPlayerStats(username: string, uncapped = false): Promise<PlayerStats> {
  const hash = await redis.hGetAll(playerKey(username));
  const score = await redis.zScore(LB_KEY, username);
  let rank: number | null = null;
  if (score !== undefined) {
    const ascRank = (await redis.zRank(LB_KEY, username)) ?? 0;
    rank = (await redis.zCard(LB_KEY)) - ascRank;
  }
  return {
    bestScore: Number(hash['bestScore'] ?? '0'),
    bestStreak: Number(hash['bestStreak'] ?? '0'),
    rank,
    carryStreak: Number(hash['currentStreak'] ?? '0'),
    playsRemaining: uncapped
      ? null
      : Math.max(0, MAX_PLAYS_PER_DAY - (await getPlaysUsedToday(username))),
  };
}

/**
 * Gate a new watch behind the daily cap. Starting a watch consumes a play
 * even if the player quits mid-run — the increment IS the reservation.
 * The returned runId makes this run's submission idempotent: the client
 * sends a keepalive copy when the page closes, and only one write lands.
 * `uncapped` (playtest subreddits) still counts plays — for the runId —
 * but never refuses one.
 */
export async function startRun(username: string, uncapped = false): Promise<RunStartResponse> {
  const key = playsKey(username);
  const used = await redis.incrBy(key, 1);
  await redis.expire(key, 60 * 60 * 48);
  if (!uncapped && used > MAX_PLAYS_PER_DAY) {
    return { type: 'runStart', allowed: false, playsRemaining: 0, carryStreak: 0, runId: null };
  }
  const day = new Date().toISOString().slice(0, 10);
  return {
    type: 'runStart',
    allowed: true,
    playsRemaining: uncapped ? null : MAX_PLAYS_PER_DAY - used,
    carryStreak: await getCarryStreak(username),
    runId: `${day}:${used}`,
  };
}

export interface RunResult {
  score: number;
  bestStreak: number;
  misses: number;
  endStreak: number;
  /** Idempotency token from startRun; null skips deduplication. */
  runId: string | null;
}

/**
 * Record a finished watch, or return null when the numbers are impossible
 * given the streak the server itself handed to this run:
 *   no misses  → endStreak must be exactly carryIn + score
 *   any miss   → the carry broke, so endStreak fits inside this run's hits
 *   bestStreak → between endStreak and carryIn + score
 */
export async function submitScore(
  username: string,
  run: RunResult
): Promise<ScoreSubmitResponse | null> {
  const carryIn = await getCarryStreak(username);
  const maxPossibleStreak = carryIn + run.score;
  const streakConsistent =
    run.misses === 0 ? run.endStreak === maxPossibleStreak : run.endStreak <= run.score;
  if (!streakConsistent || run.bestStreak < run.endStreak || run.bestStreak > maxPossibleStreak) {
    return null;
  }

  // Idempotency: the client submits both a normal fetch and a keepalive
  // copy on page close — incrBy is atomic, so exactly one write proceeds.
  if (run.runId !== null) {
    const doneKey = `done:${username}:${run.runId}`;
    const attempts = await redis.incrBy(doneKey, 1);
    await redis.expire(doneKey, 60 * 60 * 48);
    if (attempts > 1) {
      return {
        type: 'scoreSubmit',
        newBest: false,
        best: (await redis.zScore(LB_KEY, username)) ?? 0,
        carryStreak: await getCarryStreak(username),
      };
    }
  }

  const previousBest = (await redis.zScore(LB_KEY, username)) ?? -1;
  const newBest = run.score > previousBest;
  if (newBest) {
    await redis.zAdd(LB_KEY, { member: username, score: run.score });
  }

  const key = playerKey(username);
  await redis.hIncrBy(key, 'runs', 1);
  await redis.hIncrBy(key, 'aliensDown', run.score);
  await redis.hIncrBy(key, 'misses', run.misses);
  await redis.hSet(key, { currentStreak: String(run.endStreak) });
  if (newBest) await redis.hSet(key, { bestScore: String(run.score) });
  const storedStreak = Number((await redis.hGetAll(key))['bestStreak'] ?? '0');
  if (run.bestStreak > storedStreak) {
    await redis.hSet(key, { bestStreak: String(run.bestStreak) });
  }

  return {
    type: 'scoreSubmit',
    newBest,
    best: Math.max(previousBest, run.score),
    carryStreak: run.endStreak,
  };
}

/** Top N plus the requesting player's own standing (null = no score yet). */
export async function getLeaderboard(
  username: string | undefined
): Promise<LeaderboardResponse> {
  const range = await redis.zRange(LB_KEY, 0, TOP_N - 1, { by: 'rank', reverse: true });
  const top: LeaderboardEntry[] = range.map((entry, i) => ({
    rank: i + 1,
    username: entry.member,
    score: entry.score,
  }));

  let me: LeaderboardEntry | null = null;
  if (username) {
    const score = await redis.zScore(LB_KEY, username);
    if (score !== undefined) {
      const ascRank = (await redis.zRank(LB_KEY, username)) ?? 0;
      const total = await redis.zCard(LB_KEY);
      me = { rank: total - ascRank, username, score };
    }
  }

  return { type: 'leaderboard', top, me };
}
