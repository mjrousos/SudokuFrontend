import { describe, expect, it } from 'vitest';

import {
  decodeDailyPreview,
  decodeDifficulty,
  decodeGameMode,
  decodeGameMoveEvaluation,
  decodeGameResponse,
  decodeGameStatus,
  decodeLeaderboardPage,
  decodeMoveResponse,
  decodeSubmitSolutionResponse,
  decodeUserStats,
  encodeDifficulty,
  encodeGameMode,
  encodeLeaderboardPeriod,
} from './enumCodec';
import {
  Difficulty,
  GameMode,
  GameMoveEvaluation,
  GameStatus,
  LeaderboardPeriod,
} from './types';

describe('enumCodec encoders', () => {
  it('maps Difficulty string constants to backend integer values (1..4)', () => {
    expect(encodeDifficulty(Difficulty.Easy)).toBe(1);
    expect(encodeDifficulty(Difficulty.Medium)).toBe(2);
    expect(encodeDifficulty(Difficulty.Hard)).toBe(3);
    expect(encodeDifficulty(Difficulty.Expert)).toBe(4);
  });

  it('maps GameMode string constants to backend integer values (0..2)', () => {
    expect(encodeGameMode(GameMode.Practice)).toBe(0);
    expect(encodeGameMode(GameMode.Ranked)).toBe(1);
    expect(encodeGameMode(GameMode.Daily)).toBe(2);
  });

  it('maps LeaderboardPeriod string constants to backend integer values', () => {
    expect(encodeLeaderboardPeriod(LeaderboardPeriod.All)).toBe(0);
    expect(encodeLeaderboardPeriod(LeaderboardPeriod.Daily)).toBe(1);
    expect(encodeLeaderboardPeriod(LeaderboardPeriod.Weekly)).toBe(2);
    expect(encodeLeaderboardPeriod(LeaderboardPeriod.Monthly)).toBe(3);
  });
});

describe('enumCodec decoders', () => {
  it('decodes integer enum values to string constants', () => {
    expect(decodeDifficulty(1)).toBe(Difficulty.Easy);
    expect(decodeDifficulty(4)).toBe(Difficulty.Expert);
    expect(decodeGameMode(0)).toBe(GameMode.Practice);
    expect(decodeGameMode(2)).toBe(GameMode.Daily);
    expect(decodeGameStatus(0)).toBe(GameStatus.InProgress);
    expect(decodeGameStatus(1)).toBe(GameStatus.Completed);
    expect(decodeGameStatus(2)).toBe(GameStatus.Abandoned);
    expect(decodeGameMoveEvaluation(0)).toBe(GameMoveEvaluation.Consistent);
    expect(decodeGameMoveEvaluation(1)).toBe(GameMoveEvaluation.Inconsistent);
  });

  it('also accepts string forms in case the backend later adds JsonStringEnumConverter', () => {
    expect(decodeDifficulty('Easy')).toBe(Difficulty.Easy);
    expect(decodeGameMode('Ranked')).toBe(GameMode.Ranked);
    expect(decodeGameStatus('Completed')).toBe(GameStatus.Completed);
    expect(decodeGameMoveEvaluation('Inconsistent')).toBe(GameMoveEvaluation.Inconsistent);
  });

  it('throws a descriptive error on unknown values', () => {
    expect(() => decodeDifficulty(99)).toThrow(/Unknown difficulty/);
    expect(() => decodeGameMode('nope')).toThrow(/Unknown game mode/);
    expect(() => decodeGameStatus(null)).toThrow(/Unknown game status/);
  });

  it('decodes a GameResponse end-to-end', () => {
    const wire = {
      gameId: 'g',
      puzzleId: 'p',
      mode: 0,
      difficulty: 1,
      status: 0,
      givens: '0'.repeat(81),
      currentBoard: '0'.repeat(81),
      startedAt: '2024-01-01T00:00:00Z',
      completedAt: null,
      abandonedAt: null,
      completedElapsedMs: null,
      elapsedMs: 0,
      hintCount: 0,
      mistakeCount: 0,
      isAssisted: false,
      nextMoveNumber: 1,
    };
    const decoded = decodeGameResponse(wire);
    expect(decoded.mode).toBe(GameMode.Practice);
    expect(decoded.difficulty).toBe(Difficulty.Easy);
    expect(decoded.status).toBe(GameStatus.InProgress);
  });

  it('decodes MoveResponse, SubmitSolutionResponse, and DailyPreviewResponse', () => {
    const move = decodeMoveResponse({
      accepted: true,
      evaluation: 1,
      currentBoard: '0'.repeat(81),
      nextMoveNumber: 2,
    });
    expect(move.evaluation).toBe(GameMoveEvaluation.Inconsistent);

    const submit = decodeSubmitSolutionResponse({
      isCorrect: true,
      status: 1,
      completedElapsedMs: 123,
      mistakeCount: 0,
      isAssisted: false,
      leaderboardEntryCreated: true,
    });
    expect(submit.status).toBe(GameStatus.Completed);

    const preview = decodeDailyPreview({
      date: '2024-05-01',
      difficulty: 3,
      givens: '0'.repeat(81),
    });
    expect(preview.difficulty).toBe(Difficulty.Hard);
  });

  it('decodes leaderboard pages and stats with difficulty integers', () => {
    const page = decodeLeaderboardPage({
      items: [
        {
          entryId: 'e1',
          rank: 1,
          userId: 'u',
          displayName: 'A',
          puzzleId: 'p',
          difficulty: 2,
          elapsedMs: 100,
          completedAt: '2024-01-01T00:00:00Z',
          dailyDate: null,
        },
      ],
      pageSize: 50,
      nextCursor: null,
    });
    expect(page.items[0]!.difficulty).toBe(Difficulty.Medium);

    const stats = decodeUserStats({
      userId: 'u',
      displayName: 'A',
      gamesStarted: 1,
      gamesCompleted: 1,
      gamesAbandoned: 0,
      rankedCompletions: 0,
      assistedCompletions: 0,
      byDifficulty: [
        {
          difficulty: 4,
          rankedCompletions: 1,
          bestElapsedMs: 1000,
          averageElapsedMs: 1000,
          winRate: 1,
        },
      ],
      currentDailyStreak: 0,
      longestDailyStreak: 0,
    });
    expect(stats.byDifficulty[0]!.difficulty).toBe(Difficulty.Expert);
  });
});
