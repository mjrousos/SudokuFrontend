<script setup lang="ts">
import { RouterView } from 'vue-router';

import AppHeader from '@/shared/ui/AppHeader.vue';
</script>

<template>
  <div class="flex min-h-full flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <RouterView />
    </main>
    <footer class="border-t border-slate-200 py-4 text-center text-xs text-slate-500 dark:border-slate-800">
      Sudoku frontend · built with Vue 3
    </footer>
  </div>
</template>
