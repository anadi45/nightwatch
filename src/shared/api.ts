// Request/response contracts shared by client and server. The client must
// never send identity — the server derives the player from Devvit's request
// context, so these types deliberately have no username on requests.

/** Player-facing meta shown on the ready screen. */
export type PlayerStats = {
  bestScore: number;
  bestStreak: number;
  /** 1-indexed all-time rank, or null if the player has no score yet. */
  rank: number | null;
  /** Streak carried in from previous watches — seeds the next run. */
  carryStreak: number;
  /** Watches left today (server-enforced), or null for logged-out players. */
  playsRemaining: number | null;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  /** Reddit username of the viewer, or 'anonymous' when logged out. */
  username: string;
  loggedIn: boolean;
  /** Null for logged-out players (nothing to persist). */
  stats: PlayerStats | null;
};

/** Result of asking to start a watch — the daily cap is checked here. */
export type RunStartResponse = {
  type: 'runStart';
  allowed: boolean;
  playsRemaining: number | null;
  /** Streak the run must start from. */
  carryStreak: number;
};

/** End-of-watch results the client submits. Identity comes from context. */
export type ScoreSubmitRequest = {
  score: number;
  bestStreak: number;
  misses: number;
  /** Streak standing at the end of the run — becomes the new carry. */
  endStreak: number;
};

export type ScoreSubmitResponse = {
  type: 'scoreSubmit';
  /** True when this run beat the player's stored all-time best score. */
  newBest: boolean;
  /** The player's all-time best score after this submission. */
  best: number;
  /** The streak now carried toward the next watch. */
  carryStreak: number;
};

export type LeaderboardEntry = {
  rank: number;
  username: string;
  score: number;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  top: LeaderboardEntry[];
  /** The requesting player's own standing; null when they have no score yet. */
  me: LeaderboardEntry | null;
};
