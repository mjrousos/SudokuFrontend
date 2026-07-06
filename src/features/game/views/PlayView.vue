<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import AbandonDialog from '@/features/game/components/AbandonDialog.vue';
import CompletionDialog from '@/features/game/components/CompletionDialog.vue';
import GameToolbar from '@/features/game/components/GameToolbar.vue';
import NumberPad from '@/features/game/components/NumberPad.vue';
import SudokuBoard from '@/features/game/components/SudokuBoard.vue';
import AppSpinner from '@/shared/ui/AppSpinner.vue';
import { useToastStore } from '@/shared/ui/toastStore';
import { ApiError } from '@/shared/api/problemDetails';
import { GameMode, GameStatus } from '@/shared/api/types';
import { isComplete } from '@/shared/sudoku/boardCodec';
import { formatElapsed, useTimer } from '@/shared/composables/useTimer';
import { useGamesStore } from '@/features/game/store/gamesStore';

const props = defineProps<{ gameId: string }>();
const router = useRouter();
const toasts = useToastStore();
const games = useGamesStore();

const loading = ref(true);
const loadError = ref<string | null>(null);
const selected = ref<[number, number] | null>(null);
const pencilMode = ref(false);
const paused = ref(false);
const showCompletion = ref(false);
const showAbandon = ref(false);
const submittingSolution = ref(false);
const abandoning = ref(false);

const currentGame = computed(() => games.byId[props.gameId] ?? null);

const timer = useTimer({
  startedAt: new Date(),
  initialElapsedMs: 0,
  autoStart: false,
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const vm = await games.loadGame(props.gameId);
    selected.value = findFirstEmpty(vm) ?? [0, 0];
    timer.reset({ startedAt: vm.startedAt, elapsedMs: vm.elapsedMs });
    if (vm.status === GameStatus.InProgress) {
      timer.start();
    }
  } catch (err) {
    if (err instanceof ApiError) {
      loadError.value =
        err.status === 404 ? 'Game not found.' : err.detail ?? err.title ?? 'Could not load game.';
    } else {
      loadError.value = 'Could not load game.';
    }
  } finally {
    loading.value = false;
  }
}

function findFirstEmpty(vm: NonNullable<typeof currentGame.value>): [number, number] | null {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = vm.grid[r]?.[c];
      if (cell && !cell.given && cell.value === 0) return [r, c];
    }
  }
  return null;
}

function onSelect(row: number, col: number): void {
  selected.value = [row, col];
}

async function applyDigit(value: number): Promise<void> {
  const vm = currentGame.value;
  if (!vm || vm.status !== GameStatus.InProgress) return;
  if (!selected.value) return;
  const [r, c] = selected.value;
  const cell = vm.grid[r]?.[c];
  if (!cell || cell.given) return;

  if (pencilMode.value && value !== 0) {
    const notes = new Set(cell.notes);
    if (notes.has(value)) notes.delete(value);
    else notes.add(value);
    games.setCellNotes(props.gameId, r, c, notes);
    return;
  }
  if (cell.value === value && value !== 0) return; // no-op

  try {
    await games.submitMove(props.gameId, { row: r, col: c, value });
  } catch (err) {
    if (err instanceof ApiError) {
      toasts.error(err.detail ?? err.title ?? 'Move rejected.');
    } else {
      toasts.error('Move could not be saved.');
    }
  }
}

async function onBoardDigit(value: number): Promise<void> {
  if (showCompletion.value || showAbandon.value) return;
  await applyDigit(value);
}

async function onBoardClear(): Promise<void> {
  if (showCompletion.value || showAbandon.value) return;
  await applyDigit(0);
}

function onBoardPencilToggle(): void {
  if (showCompletion.value || showAbandon.value) return;
  pencilMode.value = !pencilMode.value;
}

function togglePause(): void {
  if (paused.value) {
    paused.value = false;
    if (currentGame.value?.status === GameStatus.InProgress) timer.start();
  } else {
    paused.value = true;
    timer.pause();
  }
}

async function requestHint(): Promise<void> {
  try {
    const hint = await games.useHint(props.gameId);
    if (hint) {
      selected.value = [hint.row, hint.col];
      toasts.info(`Hint: row ${hint.row + 1}, column ${hint.col + 1} = ${hint.value}.`);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) {
        toasts.warning('Clear a cell before using a hint.');
      } else {
        toasts.error(err.detail ?? err.title ?? 'Could not use a hint.');
      }
    } else {
      toasts.error('Could not use a hint.');
    }
  }
}

const submitDisabled = computed(() => {
  const vm = currentGame.value;
  return (
    !vm ||
    vm.status !== GameStatus.InProgress ||
    submittingSolution.value ||
    !isComplete(vm.currentBoard)
  );
});

async function onSubmit(): Promise<void> {
  if (submitDisabled.value) return;
  submittingSolution.value = true;
  try {
    const result = await games.submitSolution(props.gameId);
    if (result) {
      if (result.status !== GameStatus.InProgress) {
        timer.stop();
      }
      showCompletion.value = true;
    }
  } catch (err) {
    if (err instanceof ApiError) {
      toasts.error(err.detail ?? err.title ?? 'Could not submit solution.');
    } else {
      toasts.error('Could not submit solution.');
    }
  } finally {
    submittingSolution.value = false;
  }
}

function askAbandon(): void {
  showAbandon.value = true;
}

async function confirmAbandon(): Promise<void> {
  abandoning.value = true;
  try {
    await games.abandon(props.gameId);
    timer.stop();
    showAbandon.value = false;
    toasts.info('Game abandoned.');
  } catch (err) {
    if (err instanceof ApiError) {
      toasts.error(err.detail ?? err.title ?? 'Could not abandon game.');
    } else {
      toasts.error('Could not abandon game.');
    }
  } finally {
    abandoning.value = false;
  }
}

function closeCompletion(): void {
  showCompletion.value = false;
  games.clearCompletion();
}

async function viewLeaderboard(): Promise<void> {
  const vm = currentGame.value;
  if (!vm) return;
  closeCompletion();
  if (vm.mode === GameMode.Daily) {
    await router.push({ name: 'leaderboards.daily' });
  } else {
    await router.push({ name: 'leaderboards.byDifficulty', params: { difficulty: vm.difficulty } });
  }
}

async function newGame(): Promise<void> {
  closeCompletion();
  await router.push({ name: 'play.new' });
}

watch(
  () => props.gameId,
  (id, prev) => {
    if (id !== prev) {
      void load();
    }
  },
);

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  timer.stop();
});

const timerLabel = computed(() => {
  const vm = currentGame.value;
  if (vm?.status === GameStatus.Completed && vm.completedElapsedMs !== null) {
    return formatElapsed(vm.completedElapsedMs);
  }
  return timer.formatted.value;
});
</script>

<template>
  <section class="space-y-6">
    <div v-if="loading" class="flex items-center gap-3" data-testid="play-loading">
      <AppSpinner />
      <span>Loading game…</span>
    </div>
    <div v-else-if="loadError" class="text-rose-600" role="alert" data-testid="play-error">
      {{ loadError }}
    </div>
    <template v-else-if="currentGame">
      <header class="flex items-baseline justify-between">
        <h1 class="text-2xl font-semibold">
          {{ currentGame.mode }} · {{ currentGame.difficulty }}
        </h1>
        <span
          v-if="currentGame.status !== 'InProgress'"
          class="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
          data-testid="status-badge"
        >
          {{ currentGame.status }}
        </span>
      </header>

      <div class="grid gap-6 md:grid-cols-[auto_1fr]">
        <div class="space-y-3">
          <SudokuBoard
            v-if="!paused"
            :grid="currentGame.grid"
            :selected="selected"
            :pencil-mode="pencilMode"
            :disabled="currentGame.status !== 'InProgress'"
            @select="onSelect"
            @digit="onBoardDigit"
            @clear="onBoardClear"
            @pencil-toggle="onBoardPencilToggle"
          />
          <p v-if="paused" class="text-sm text-slate-500" data-testid="paused-banner">
            Board hidden. Resume to continue.
          </p>
        </div>
        <div class="space-y-4">
          <GameToolbar
            :mode="currentGame.mode"
            :status="currentGame.status"
            :elapsed-formatted="timerLabel"
            :hint-count="currentGame.hintCount"
            :mistake-count="currentGame.mistakeCount"
            :paused="paused"
            :submit-disabled="submitDisabled"
            @toggle-pause="togglePause"
            @hint="requestHint"
            @submit="onSubmit"
            @abandon="askAbandon"
          />
          <NumberPad
            :pencil-mode="pencilMode"
            :disabled="paused || currentGame.status !== 'InProgress'"
            @digit="applyDigit"
            @clear="applyDigit(0)"
            @pencil-toggle="pencilMode = !pencilMode"
          />
        </div>
      </div>
    </template>

    <CompletionDialog
      v-if="games.completion && games.completion.gameId === props.gameId"
      :open="showCompletion"
      :is-correct="games.completion.isCorrect"
      :elapsed-ms="games.completion.completedElapsedMs"
      :mistake-count="games.completion.mistakeCount"
      :is-assisted="games.completion.isAssisted"
      :leaderboard-entry-created="games.completion.leaderboardEntryCreated"
      @close="closeCompletion"
      @view-leaderboard="viewLeaderboard"
      @new-game="newGame"
    />

    <AbandonDialog
      :open="showAbandon"
      :pending="abandoning"
      @confirm="confirmAbandon"
      @cancel="showAbandon = false"
    />
  </section>
</template>
