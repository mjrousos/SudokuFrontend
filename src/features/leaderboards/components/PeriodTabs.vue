<script setup lang="ts">
import type { LeaderboardPeriod } from '@/shared/api/types';
import { LeaderboardPeriod as LeaderboardPeriodValues } from '@/shared/api/types';

interface Props {
  modelValue: LeaderboardPeriod;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [LeaderboardPeriod];
}>();

const periods: LeaderboardPeriod[] = [
  LeaderboardPeriodValues.All,
  LeaderboardPeriodValues.Daily,
  LeaderboardPeriodValues.Weekly,
  LeaderboardPeriodValues.Monthly,
];

function tabClasses(active: boolean): string[] {
  return [
    'rounded-md px-3 py-2 text-sm font-medium transition',
    active
      ? 'bg-blue-600 text-white'
      : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
  ];
}

function select(period: LeaderboardPeriod): void {
  if (period !== props.modelValue) {
    emit('update:modelValue', period);
  }
}
</script>

<template>
  <div class="flex flex-wrap gap-2" role="tablist" aria-label="Leaderboard period">
    <button
      v-for="period in periods"
      :key="period"
      type="button"
      :class="tabClasses(modelValue === period)"
      :aria-pressed="modelValue === period"
      :data-testid="`period-tab-${period}`"
      @click="select(period)"
    >
      {{ period }}
    </button>
  </div>
</template>
