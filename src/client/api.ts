import type {
  InitResponse,
  LeaderboardResponse,
  RunStartResponse,
  ScoreSubmitRequest,
  ScoreSubmitResponse,
} from '../shared/api.js';

// Thin typed wrappers over the Devvit-proxied /api routes. Every helper
// swallows failures into null — the game must never break because the
// network did (logged-out players get a 401 from /score, for instance).

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postJson<T>(url: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const fetchInit = (): Promise<InitResponse | null> => getJson('/api/init');

export const startRun = (): Promise<RunStartResponse | null> => postJson('/api/run/start');

export const submitScore = (run: ScoreSubmitRequest): Promise<ScoreSubmitResponse | null> =>
  postJson('/api/score', run);

export const fetchLeaderboard = (): Promise<LeaderboardResponse | null> =>
  getJson('/api/leaderboard');
