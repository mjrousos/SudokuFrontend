<script setup lang="ts">
import { computed } from 'vue';

import { formatElapsed } from '@/shared/composables/useTimer';
import { DIFFICULTIES } from '@/shared/api/types';
import type { DifficultyStats } from '@/shared/api/types';

const props = defineProps<{
  byDifficulty: DifficultyStats[];
}>();

const rows = computed(() =>
  [...props.byDifficulty].sort(
    (left, right) =>
      DIFFICULTIES.indexOf(left.difficulty) - DIFFICULTIES.indexOf(right.difficulty),
  ),
);

function formatDuration(value: number | null): string {
  return value === null ? '—' : formatElapsed(value);
}

function formatWinRate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(0)}%`;
}
</script>

<template>
  <section class="space-y-4" data-testid="difficulty-stats-table">
    <div>
      <h2 class="text-lg font-semibold">By difficulty</h2>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        Ranked completions and timing breakdowns for each difficulty.
      </p>
    </div>

    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
        <thead class="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            <th class="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Difficulty</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Ranked completions</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Best time</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Average time</th>
            <th class="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Win rate</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
          <tr v-for="entry in rows" :key="entry.difficulty">
            <td class="px-4 py-3 font-medium">{{ entry.difficulty }}</td>
            <td class="px-4 py-3">{{ entry.rankedCompletions }}</td>
            <td class="px-4 py-3">{{ formatDuration(entry.bestElapsedMs) }}</td>
            <td class="px-4 py-3">{{ formatDuration(entry.averageElapsedMs) }}</td>
            <td class="px-4 py-3">{{ formatWinRate(entry.winRate) }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="5" class="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
              No difficulty stats yet.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
