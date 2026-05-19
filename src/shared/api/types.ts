// Shared API DTOs that mirror SudokuBackend's response & request shapes.
// Keep this file purely declarative — no runtime logic — so it's safe to
// import from anywhere without pulling extra modules.

export const Difficulty = {
  Easy: 'Easy',
  Medium: 'Medium',
  Hard: 'Hard',
  Expert: 'Expert',
} as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];
export const DIFFICULTIES: Difficulty[] = [
  Difficulty.Easy,
  Difficulty.Medium,
  Difficulty.Hard,
  Difficulty.Expert,
];

export const GameMode = {
  Practice: 'Practice',
  Ranked: 'Ranked',
  Daily: 'Daily',
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

export const GameStatus = {
  InProgress: 'InProgress',
  Completed: 'Completed',
  Abandoned: 'Abandoned',
} as const;
export type GameStatus = (typeof GameStatus)[keyof typeof GameStatus];

export const GameMoveEvaluation = {
  Consistent: 'Consistent',
  Inconsistent: 'Inconsistent',
} as const;
export type GameMoveEvaluation =
  (typeof GameMoveEvaluation)[keyof typeof GameMoveEvaluation];

export const LeaderboardPeriod = {
  All: 'All',
  Daily: 'Daily',
  Weekly: 'Weekly',
  Monthly: 'Monthly',
} as const;
export type LeaderboardPeriod =
  (typeof LeaderboardPeriod)[keyof typeof LeaderboardPeriod];

// ---------- Auth ----------

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterResponse {
  userId: string;
  displayName: string;
  email: string;
  requiresEmailConfirmation: boolean;
  emailConfirmationToken: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ConfirmEmailRequest {
  userId: string;
  token: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  email: string;
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  displayName: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  accessTokenExpiresAt: string; // ISO datetime
  refreshToken: string;
  refreshTokenExpiresAt: string;
  userId: string;
  displayName: string;
}

export interface UserProfileResponse {
  userId: string;
  displayName: string;
  email: string;
  createdAt: string;
}

// ---------- Games ----------

export interface CreateGameRequest {
  mode: GameMode;
  difficulty: Difficulty;
}

export interface GameMoveRequest {
  moveNumber: number;
  row: number;
  col: number;
  value: number;
}

export interface SubmitSolutionRequest {
  board: string; // 81-char digit string
}

export interface GameResponse {
  gameId: string;
  puzzleId: string;
  mode: GameMode;
  difficulty: Difficulty;
  status: GameStatus;
  givens: string; // 81-char
  currentBoard: string; // 81-char
  startedAt: string;
  completedAt: string | null;
  abandonedAt: string | null;
  completedElapsedMs: number | null;
  elapsedMs: number;
  hintCount: number;
  mistakeCount: number;
  isAssisted: boolean;
  nextMoveNumber: number;
}

export interface MoveResponse {
  accepted: boolean;
  evaluation: GameMoveEvaluation;
  currentBoard: string;
  nextMoveNumber: number;
}

export interface SubmitSolutionResponse {
  isCorrect: boolean;
  status: GameStatus;
  completedElapsedMs: number | null;
  mistakeCount: number;
  isAssisted: boolean;
  leaderboardEntryCreated: boolean;
}

export interface HintResponse {
  row: number;
  col: number;
  value: number;
  currentBoard: string;
  hintCount: number;
  isAssisted: boolean;
}

// ---------- Puzzles ----------

export interface DailyPreviewResponse {
  date: string; // YYYY-MM-DD
  difficulty: Difficulty;
  givens: string;
}

// ---------- Leaderboards ----------

export interface LeaderboardEntryDto {
  entryId: string;
  rank: number;
  userId: string | null;
  displayName: string;
  puzzleId: string;
  difficulty: Difficulty;
  elapsedMs: number;
  completedAt: string;
  dailyDate: string | null;
}

export interface LeaderboardPage {
  items: LeaderboardEntryDto[];
  pageSize: number;
  nextCursor: string | null;
}

// ---------- Users / Stats ----------

export interface DifficultyStats {
  difficulty: Difficulty;
  rankedCompletions: number;
  bestElapsedMs: number | null;
  averageElapsedMs: number | null;
  winRate: number | null;
}

export interface UserStatsDto {
  userId: string;
  displayName: string;
  gamesStarted: number;
  gamesCompleted: number;
  gamesAbandoned: number;
  rankedCompletions: number;
  assistedCompletions: number;
  byDifficulty: DifficultyStats[];
  currentDailyStreak: number;
  longestDailyStreak: number;
}

// ---------- ProblemDetails / errors ----------

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  [extension: string]: unknown;
}
