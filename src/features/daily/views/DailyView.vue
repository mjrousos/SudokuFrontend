<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import SudokuBoard from '@/features/game/components/SudokuBoard.vue';
import { ApiError } from '@/shared/api/problemDetails';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import AppButton from '@/shared/ui/AppButton.vue';
import AppSpinner from '@/shared/ui/AppSpinner.vue';
import { useToastStore } from '@/shared/ui/toastStore';
import { todayUtc, useDailyStore } from '../store/dailyStore';

const PREVIEW_WINDOW_DAYS = 30;

const auth = useAuthStore();
const daily = useDailyStore();
const router = useRouter();
const toasts = useToastStore();

const now = new Date();
const today = todayUtc(now);
const selectedDate = ref('');
const previewRequested = ref(false);
const previewError = ref<string | null>(null);
const startingToday = ref(false);

function shiftUtcDays(base: Date, days: number): string {
  const shifted = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days),
  );
  return todayUtc(shifted);
}

const minPreviewDate = shiftUtcDays(now, -PREVIEW_WINDOW_DAYS);
const maxPreviewDate = today;

const preview = computed(() =>
  selectedDate.value ? daily.previewByDate[selectedDate.value] ?? null : null,
);

const previewGrid = computed(() =>
  preview.value ? decodeBoard(preview.value.givens, preview.value.givens) : null,
);

const previewLoading = computed(() =>
  selectedDate.value ? daily.loadingByDate[selectedDate.value] ?? false : false,
);

const previewUnavailable = computed(() =>
  selectedDate.value ? daily.unavailableByDate[selectedDate.value] ?? false : false,
);

const unavailableMessage = computed(() =>
  selectedDate.value === today
    ? "Today's daily is hidden until you complete or abandon today's game."
    : 'No daily puzzle available for that date.',
);

async function playToday(): Promise<void> {
  startingToday.value = true;
  try {
    const game = await daily.startToday();
    await router.push({ name: 'play.game', params: { gameId: game.gameId } });
  } catch (err) {
    if (err instanceof ApiError) {
      toasts.error(err.detail ?? err.title ?? 'Could not start today\'s daily.');
    } else {
      toasts.error('Could not start today\'s daily.');
    }
  } finally {
    startingToday.value = false;
  }
}

async function onPreviewDateChange(): Promise<void> {
  if (!selectedDate.value) return;

  previewRequested.value = true;
  previewError.value = null;

  try {
    await daily.loadPreview(selectedDate.value);
  } catch (err) {
    if (err instanceof ApiError) {
      previewError.value = err.detail ?? err.title ?? 'Could not load the daily preview.';
      toasts.error(previewError.value);
    } else {
      previewError.value = 'Could not load the daily preview.';
      toasts.error(previewError.value);
    }
  }
}
</script>

<template>
  <section class="space-y-8">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold">Daily puzzle</h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        Today&#39;s daily follows the UTC date: <span class="font-medium">{{ today }}</span>
      </p>
    </header>

    <section class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">Today&#39;s challenge</h2>
          <p v-if="auth.isAuthenticated" class="text-sm text-slate-600 dark:text-slate-300">
            Start or resume today&#39;s daily puzzle for {{ today }}.
          </p>
          <p v-else class="text-sm text-slate-600 dark:text-slate-300">
            Play anonymously, or sign in to keep your progress tied to your account.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <AppButton
            :loading="startingToday"
            data-testid="play-today"
            @click="playToday"
          >
            Play today&#39;s daily
          </AppButton>

          <RouterLink
            v-if="!auth.isAuthenticated"
            :to="{ name: 'login', query: { redirectTo: '/daily' } }"
            class="inline-flex"
          >
            <AppButton variant="secondary" data-testid="sign-in-daily">Sign in</AppButton>
          </RouterLink>
        </div>
      </div>
    </section>

    <section class="space-y-4">
      <div class="max-w-xs space-y-2">
        <label for="daily-preview-date" class="text-sm font-medium">Browse recent previews</label>
        <input
          id="daily-preview-date"
          v-model="selectedDate"
          type="date"
          :min="minPreviewDate"
          :max="maxPreviewDate"
          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950"
          data-testid="preview-date"
          @change="onPreviewDateChange"
        />
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Pick any date from the last {{ PREVIEW_WINDOW_DAYS }} days to see the published givens.
        </p>
      </div>

      <div v-if="previewLoading" class="flex items-center gap-3" data-testid="preview-loading">
        <AppSpinner />
        <span>Loading daily preview…</span>
      </div>

      <p
        v-else-if="previewError"
        class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
        role="alert"
        data-testid="preview-error"
      >
        {{ previewError }}
      </p>

      <p
        v-else-if="previewRequested && previewUnavailable"
        class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
        data-testid="preview-unavailable"
      >
        {{ unavailableMessage }}
      </p>

      <div v-else-if="preview && previewGrid" class="space-y-4">
        <p class="text-sm text-slate-600 dark:text-slate-300">
          <span class="font-medium">{{ preview.date }}</span> · {{ preview.difficulty }}
        </p>
        <SudokuBoard :grid="previewGrid" :selected="null" disabled />
      </div>

      <p v-else class="text-sm text-slate-500 dark:text-slate-400" data-testid="preview-empty">
        Select a date to preview its givens.
      </p>
    </section>
  </section>
</template>
