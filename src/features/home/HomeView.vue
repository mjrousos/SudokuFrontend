<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import AppButton from '@/shared/ui/AppButton.vue';

const auth = useAuthStore();
const greeting = computed(() =>
  auth.isAuthenticated ? `Welcome back, ${auth.user?.displayName ?? ''}!` : 'Welcome to Sudoku',
);
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-3xl font-bold">{{ greeting }}</h1>
    <p class="text-slate-600 dark:text-slate-300">
      Play a quick practice puzzle, take on today’s daily challenge, or compete on the leaderboards.
    </p>
    <div class="flex flex-wrap gap-3">
      <RouterLink :to="{ name: 'play.new' }">
        <AppButton size="lg">Start a new game</AppButton>
      </RouterLink>
      <RouterLink :to="{ name: 'daily' }">
        <AppButton size="lg" variant="secondary">Daily puzzle</AppButton>
      </RouterLink>
      <RouterLink :to="{ name: 'leaderboards.default' }">
        <AppButton size="lg" variant="ghost">Leaderboards</AppButton>
      </RouterLink>
    </div>
  </section>
</template>
