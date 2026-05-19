<script setup lang="ts">
import { RouterLink } from 'vue-router';

import type { Difficulty } from '@/shared/api/types';
import { DIFFICULTIES } from '@/shared/api/types';

interface Props {
  modelValue: Difficulty | 'Daily';
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [Difficulty | 'Daily'];
}>();

function tabClasses(active: boolean): string[] {
  return [
    'rounded-md px-3 py-2 text-sm font-medium transition',
    active
      ? 'bg-blue-600 text-white'
      : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800',
  ];
}

function selectDifficulty(difficulty: Difficulty): void {
  if (difficulty !== props.modelValue) {
    emit('update:modelValue', difficulty);
  }
}
</script>

<template>
  <nav class="flex flex-wrap gap-2" aria-label="Leaderboard difficulty tabs">
    <button
      v-for="difficulty in DIFFICULTIES"
      :key="difficulty"
      type="button"
      :class="tabClasses(modelValue === difficulty)"
      :aria-pressed="modelValue === difficulty"
      :data-testid="`difficulty-tab-${difficulty}`"
      @click="selectDifficulty(difficulty)"
    >
      {{ difficulty }}
    </button>
    <RouterLink
      to="/leaderboards/daily"
      :class="tabClasses(modelValue === 'Daily')"
      :aria-current="modelValue === 'Daily' ? 'page' : undefined"
      data-testid="difficulty-tab-Daily"
    >
      Daily
    </RouterLink>
  </nav>
</template>
