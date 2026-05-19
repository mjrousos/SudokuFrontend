<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import DifficultyTabs from '../components/DifficultyTabs.vue';
import LeaderboardTable from '../components/LeaderboardTable.vue';
import PeriodTabs from '../components/PeriodTabs.vue';
import { useLeaderboardsStore } from '../store/leaderboardsStore';
import type {
  LeaderboardCacheEntry,
  LeaderboardsQueryArgs,
} from '../store/leaderboardsStore';
import { ApiError } from '@/shared/api/problemDetails';
import type {
  Difficulty as DifficultyValue,
  LeaderboardPeriod as LeaderboardPeriodValue,
} from '@/shared/api/types';
import {
  DIFFICULTIES,
  Difficulty,
  LeaderboardPeriod,
} from '@/shared/api/types';
import AppInput from '@/shared/ui/AppInput.vue';
import { useToastStore } from '@/shared/ui/toastStore';

const props = defineProps<{
  kind: 'difficulty' | 'daily';
  difficulty?: string;
}>();

const PAGE_SIZE = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const periods: LeaderboardPeriodValue[] = [
  LeaderboardPeriod.All,
  LeaderboardPeriod.Daily,
  LeaderboardPeriod.Weekly,
  LeaderboardPeriod.Monthly,
];
const emptyEntry: LeaderboardCacheEntry = {
  entries: [],
  nextCursor: null,
  loading: false,
  error: null,
  locked: false,
};

const route = useRoute();
const router = useRouter();
const leaderboards = useLeaderboardsStore();
const toasts = useToastStore();
const dateInput = ref(utcToday());

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function queryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function isDifficulty(value: unknown): value is DifficultyValue {
  return typeof value === 'string' && DIFFICULTIES.some((difficulty) => difficulty === value);
}

function isPeriod(value: unknown): value is LeaderboardPeriodValue {
  return typeof value === 'string' && periods.some((period) => period === value);
}

function normalizePeriod(value: unknown): LeaderboardPeriodValue {
  const period = queryValue(value);
  return isPeriod(period) ? period : LeaderboardPeriod.All;
}

function normalizeDate(value: unknown): string {
  const date = queryValue(value);
  return date && DATE_PATTERN.test(date) ? date : utcToday();
}

function difficultyQuery(period: LeaderboardPeriodValue): { period: LeaderboardPeriodValue } | undefined {
  return period === LeaderboardPeriod.All ? undefined : { period };
}

function showLoadError(error: unknown): void {
  if (error instanceof ApiError) {
    toasts.error(error.detail ?? error.title ?? 'Could not load the leaderboard.');
    return;
  }
  toasts.error('Could not load the leaderboard.');
}

const currentDifficulty = computed<DifficultyValue | null>(() => {
  if (props.kind !== 'difficulty') return null;
  return isDifficulty(props.difficulty) ? props.difficulty : null;
});

const selectedPeriod = computed<LeaderboardPeriodValue>({
  get: () => normalizePeriod(route.query.period),
  set: (value) => {
    if (props.kind !== 'difficulty') return;
    if (value === selectedPeriod.value) return;
    void router.replace({
      name: 'leaderboards.byDifficulty',
      params: { difficulty: currentDifficulty.value ?? Difficulty.Easy },
      query: difficultyQuery(value),
    });
  },
});

const selectedTab = computed<DifficultyValue | 'Daily'>({
  get: () => (props.kind === 'daily' ? 'Daily' : currentDifficulty.value ?? Difficulty.Easy),
  set: (value) => {
    if (value === 'Daily') {
      void router.replace({
        name: 'leaderboards.daily',
        query: { date: dateInput.value },
      });
      return;
    }

    if (props.kind === 'difficulty' && value === currentDifficulty.value) return;
    void router.replace({
      name: 'leaderboards.byDifficulty',
      params: { difficulty: value },
      query: difficultyQuery(selectedPeriod.value),
    });
  },
});

const currentArgs = computed<LeaderboardsQueryArgs | null>(() => {
  if (props.kind === 'difficulty') {
    if (!currentDifficulty.value) return null;
    return {
      kind: 'difficulty',
      difficulty: currentDifficulty.value,
      period: selectedPeriod.value,
      pageSize: PAGE_SIZE,
    };
  }

  return {
    kind: 'daily',
    date: normalizeDate(route.query.date),
    pageSize: PAGE_SIZE,
  };
});

const currentEntry = computed<LeaderboardCacheEntry>(() =>
  currentArgs.value ? leaderboards.get(currentArgs.value) : emptyEntry,
);

const errorMessage = computed(() => {
  const error = currentEntry.value.error;
  return error ? (error.detail ?? error.title ?? 'Could not load the leaderboard.') : null;
});

watch(
  () => [props.kind, props.difficulty] as const,
  ([kind, difficulty]) => {
    if (kind === 'difficulty' && !isDifficulty(difficulty)) {
      void router.replace({
        name: 'leaderboards.byDifficulty',
        params: { difficulty: Difficulty.Easy },
      });
    }
  },
  { immediate: true },
);

watch(
  () => route.query.date,
  (value) => {
    if (props.kind === 'daily') {
      dateInput.value = normalizeDate(value);
    }
  },
  { immediate: true },
);

watch(dateInput, (value) => {
  if (props.kind !== 'daily') return;
  if (!DATE_PATTERN.test(value)) return;
  if (value === normalizeDate(route.query.date)) return;
  void router.replace({
    name: 'leaderboards.daily',
    query: { date: value },
  });
});

watch(
  currentArgs,
  async (args) => {
    if (!args) return;
    try {
      await leaderboards.load(args);
    } catch (error) {
      showLoadError(error);
    }
  },
  { immediate: true },
);

async function onLoadMore(): Promise<void> {
  if (!currentArgs.value) return;
  try {
    await leaderboards.loadMore(currentArgs.value);
  } catch (error) {
    showLoadError(error);
  }
}
</script>

<template>
  <section class="space-y-6">
    <header class="space-y-1">
      <h1 class="text-2xl font-semibold">Leaderboards</h1>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        {{
          kind === 'daily'
            ? 'Browse daily leaderboard results by date.'
            : 'See the fastest ranked completions for each difficulty.'
        }}
      </p>
    </header>

    <DifficultyTabs v-model="selectedTab" />

    <div v-if="kind === 'difficulty'">
      <PeriodTabs v-model="selectedPeriod" />
    </div>
    <div v-else class="max-w-xs">
      <AppInput v-model="dateInput" label="Date" type="date" input-id="leaderboard-date" />
    </div>

    <p
      v-if="errorMessage"
      class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      role="alert"
      data-testid="leaderboards-error"
    >
      {{ errorMessage }}
    </p>

    <LeaderboardTable
      :entries="currentEntry.entries"
      :loading="currentEntry.loading"
      :has-more="currentEntry.nextCursor !== null"
      :locked="currentEntry.locked"
      :kind="kind"
      @load-more="onLoadMore"
    />
  </section>
</template>
