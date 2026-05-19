<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import AppSpinner from '@/shared/ui/AppSpinner.vue';

import DifficultyStatsTable from '../components/DifficultyStatsTable.vue';
import StatsSummary from '../components/StatsSummary.vue';
import { useStatsStore } from '../store/statsStore';

interface Props {
  userId?: string;
}

const props = defineProps<Props>();

const auth = useAuthStore();
const router = useRouter();
const statsStore = useStatsStore();

const cacheKey = computed(() => props.userId ?? 'me');
const stats = computed(() => statsStore.get(cacheKey.value));
const loading = computed(() => statsStore.loading[cacheKey.value] ?? false);
const errorMessage = computed(() => statsStore.error?.detail ?? statsStore.error?.title ?? null);

async function loadStats(): Promise<void> {
  if (!props.userId && !auth.isAuthenticated) {
    await router.replace({ name: 'login', query: { redirectTo: '/stats' } });
    return;
  }

  try {
    if (props.userId) {
      await statsStore.loadByUserId(props.userId);
      return;
    }

    await statsStore.loadMine();
  } catch {
    // The store captures ApiError details for the UI.
  }
}

watch(
  () => [props.userId, auth.isAuthenticated] as const,
  () => {
    void loadStats();
  },
  { immediate: true },
);
</script>

<template>
  <section class="space-y-6" data-testid="stats-view">
    <header class="space-y-2">
      <h1 class="text-2xl font-semibold">Stats</h1>
      <p class="text-slate-600 dark:text-slate-300">
        {{ stats ? `Performance for ${stats.displayName}.` : 'Track completions, streaks, and times.' }}
      </p>
    </header>

    <div
      v-if="loading && !stats"
      class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      data-testid="stats-loading"
    >
      <AppSpinner />
      <span>Loading stats…</span>
    </div>

    <p
      v-else-if="errorMessage && !stats"
      class="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      role="alert"
      data-testid="stats-error"
    >
      Could not load stats: {{ errorMessage }}
    </p>

    <template v-else-if="stats">
      <StatsSummary :stats="stats" />
      <DifficultyStatsTable :by-difficulty="stats.byDifficulty" />
    </template>
  </section>
</template>
