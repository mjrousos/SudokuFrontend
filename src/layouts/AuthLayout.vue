<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';

import ThemeToggle from '@/shared/ui/ThemeToggle.vue';
</script>

<template>
  <div class="relative flex min-h-full flex-col items-center justify-center bg-slate-100 px-4 py-12 dark:bg-slate-950">
    <div class="absolute right-4 top-4">
      <ThemeToggle />
    </div>
    <RouterLink
      :to="{ name: 'home' }"
      class="mb-8 flex items-center gap-2 text-xl font-semibold"
    >
      <span aria-hidden="true">🟦</span>
      Sudoku
    </RouterLink>
    <div class="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900">
      <RouterView />
    </div>
  </div>
</template>
