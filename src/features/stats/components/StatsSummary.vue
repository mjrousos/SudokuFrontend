<script setup lang="ts">
import type { UserStatsDto } from '@/shared/api/types';

defineProps<{
  stats: UserStatsDto;
}>();
</script>

<template>
  <section class="space-y-4" data-testid="stats-summary">
    <div>
      <h2 class="text-lg font-semibold">Summary for {{ stats.displayName }}</h2>
      <p class="text-sm text-slate-600 dark:text-slate-300">
        A quick look at completed games, ranked runs, and daily streaks.
      </p>
    </div>

    <dl class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Games started</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.gamesStarted }}</dd>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Games completed</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.gamesCompleted }}</dd>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Games abandoned</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.gamesAbandoned }}</dd>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Ranked completions</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.rankedCompletions }}</dd>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Assisted completions</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.assistedCompletions }}</dd>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Current streak</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.currentDailyStreak }}</dd>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:col-span-2 xl:col-span-3">
        <dt class="text-sm text-slate-500 dark:text-slate-400">Longest streak</dt>
        <dd class="mt-2 text-2xl font-semibold">{{ stats.longestDailyStreak }}</dd>
      </div>
    </dl>
  </section>
</template>
