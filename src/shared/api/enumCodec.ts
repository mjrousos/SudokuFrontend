/**
 * SudokuBackend serializes/deserializes enums as **integers** because the
 * backend does not register a `JsonStringEnumConverter`. Our TypeScript code
 * works with string-typed enums for ergonomics (display, URL slugs, ===),
 * so this module is the single place that translates between the wire format
 * (integers, matching `Domain/Entities/*.cs` enum values) and our string
 * constants.
 *
 * Always run request bodies through `encode*` before sending and run response
 * bodies through `decode*` immediately after receiving so the rest of the
 * application can rely on string enums everywhere.
 */
import {
  Difficulty,
  GameMode,
  GameMoveEvaluation,
  GameStatus,
  LeaderboardPeriod,
  type DailyPreviewResponse,
  type DifficultyStats,
  type GameResponse,
  type LeaderboardEntryDto,
  type LeaderboardPage,
  type MoveResponse,
  type SubmitSolutionResponse,
  type UserStatsDto,
} from './types';

// ---------- Wire ↔ string maps ----------

const DIFFICULTY_TO_WIRE: Record<Difficulty, number> = {
  [Difficulty.Easy]: 1,
  [Difficulty.Medium]: 2,
  [Difficulty.Hard]: 3,
  [Difficulty.Expert]: 4,
};
const WIRE_TO_DIFFICULTY: Record<number, Difficulty> = {
  1: Difficulty.Easy,
  2: Difficulty.Medium,
  3: Difficulty.Hard,
  4: Difficulty.Expert,
};

const GAME_MODE_TO_WIRE: Record<GameMode, number> = {
  [GameMode.Practice]: 0,
  [GameMode.Ranked]: 1,
  [GameMode.Daily]: 2,
};
const WIRE_TO_GAME_MODE: Record<number, GameMode> = {
  0: GameMode.Practice,
  1: GameMode.Ranked,
  2: GameMode.Daily,
};

const WIRE_TO_GAME_STATUS: Record<number, GameStatus> = {
  0: GameStatus.InProgress,
  1: GameStatus.Completed,
  2: GameStatus.Abandoned,
};

const WIRE_TO_MOVE_EVAL: Record<number, GameMoveEvaluation> = {
  0: GameMoveEvaluation.Consistent,
  1: GameMoveEvaluation.Inconsistent,
};

const LEADERBOARD_PERIOD_TO_WIRE: Record<LeaderboardPeriod, number> = {
  [LeaderboardPeriod.All]: 0,
  [LeaderboardPeriod.Daily]: 1,
  [LeaderboardPeriod.Weekly]: 2,
  [LeaderboardPeriod.Monthly]: 3,
};

// ---------- Encoders (string → wire) ----------

export function encodeDifficulty(d: Difficulty): number {
  return DIFFICULTY_TO_WIRE[d];
}

export function encodeGameMode(m: GameMode): number {
  return GAME_MODE_TO_WIRE[m];
}

export function encodeLeaderboardPeriod(p: LeaderboardPeriod): number {
  return LEADERBOARD_PERIOD_TO_WIRE[p];
}

// ---------- Decoders (wire → string) ----------
//
// Each decoder accepts both the wire integer (preferred) and a string
// fallback. The string path handles the unlikely case that the backend
// later adds a JsonStringEnumConverter — no need to break the frontend.

function asNumberOrString(v: unknown): number | string {
  return typeof v === 'number' || typeof v === 'string' ? v : NaN;
}

export function decodeDifficulty(v: unknown): Difficulty {
  const raw = asNumberOrString(v);
  if (typeof raw === 'number') {
    const d = WIRE_TO_DIFFICULTY[raw];
    if (d) return d;
  } else if (raw in Difficulty) {
    return Difficulty[raw as keyof typeof Difficulty];
  }
  throw new Error(`Unknown difficulty value from server: ${String(v)}`);
}

export function decodeGameMode(v: unknown): GameMode {
  const raw = asNumberOrString(v);
  if (typeof raw === 'number') {
    const m = WIRE_TO_GAME_MODE[raw];
    if (m) return m;
  } else if (raw in GameMode) {
    return GameMode[raw as keyof typeof GameMode];
  }
  throw new Error(`Unknown game mode value from server: ${String(v)}`);
}

export function decodeGameStatus(v: unknown): GameStatus {
  const raw = asNumberOrString(v);
  if (typeof raw === 'number') {
    const s = WIRE_TO_GAME_STATUS[raw];
    if (s) return s;
  } else if (raw in GameStatus) {
    return GameStatus[raw as keyof typeof GameStatus];
  }
  throw new Error(`Unknown game status value from server: ${String(v)}`);
}

export function decodeGameMoveEvaluation(v: unknown): GameMoveEvaluation {
  const raw = asNumberOrString(v);
  if (typeof raw === 'number') {
    const e = WIRE_TO_MOVE_EVAL[raw];
    if (e) return e;
  } else if (raw in GameMoveEvaluation) {
    return GameMoveEvaluation[raw as keyof typeof GameMoveEvaluation];
  }
  throw new Error(`Unknown move evaluation value from server: ${String(v)}`);
}

// ---------- Composite decoders ----------

export function decodeGameResponse(raw: unknown): GameResponse {
  const g = raw as Record<string, unknown> & GameResponse;
  return {
    ...(g as unknown as GameResponse),
    mode: decodeGameMode(g.mode),
    difficulty: decodeDifficulty(g.difficulty),
    status: decodeGameStatus(g.status),
  };
}

export function decodeMoveResponse(raw: unknown): MoveResponse {
  const m = raw as Record<string, unknown> & MoveResponse;
  return {
    ...(m as unknown as MoveResponse),
    evaluation: decodeGameMoveEvaluation(m.evaluation),
  };
}

export function decodeSubmitSolutionResponse(raw: unknown): SubmitSolutionResponse {
  const s = raw as Record<string, unknown> & SubmitSolutionResponse;
  return {
    ...(s as unknown as SubmitSolutionResponse),
    status: decodeGameStatus(s.status),
  };
}

export function decodeDailyPreview(raw: unknown): DailyPreviewResponse {
  const p = raw as Record<string, unknown> & DailyPreviewResponse;
  return {
    ...(p as unknown as DailyPreviewResponse),
    difficulty: decodeDifficulty(p.difficulty),
  };
}

export function decodeLeaderboardEntry(raw: unknown): LeaderboardEntryDto {
  const e = raw as Record<string, unknown> & LeaderboardEntryDto;
  return {
    ...(e as unknown as LeaderboardEntryDto),
    difficulty: decodeDifficulty(e.difficulty),
  };
}

export function decodeLeaderboardPage(raw: unknown): LeaderboardPage {
  const p = raw as Record<string, unknown> & LeaderboardPage;
  return {
    ...(p as unknown as LeaderboardPage),
    items: (p.items as unknown[]).map(decodeLeaderboardEntry),
  };
}

export function decodeDifficultyStats(raw: unknown): DifficultyStats {
  const s = raw as Record<string, unknown> & DifficultyStats;
  return {
    ...(s as unknown as DifficultyStats),
    difficulty: decodeDifficulty(s.difficulty),
  };
}

export function decodeUserStats(raw: unknown): UserStatsDto {
  const s = raw as Record<string, unknown> & UserStatsDto;
  return {
    ...(s as unknown as UserStatsDto),
    byDifficulty: (s.byDifficulty as unknown[]).map(decodeDifficultyStats),
  };
}
