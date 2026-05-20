<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import AppButton from '@/shared/ui/AppButton.vue';
import ThemeToggle from '@/shared/ui/ThemeToggle.vue';

const auth = useAuthStore();
const router = useRouter();

const displayName = computed(() => auth.user?.displayName ?? '');

async function onLogout() {
  await auth.logout();
  await router.push({ name: 'login' });
}
</script>

<template>
  <header
    class="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80"
  >
    <div class="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
      <RouterLink :to="{ name: 'home' }" class="flex items-center gap-2 font-semibold">
        <span aria-hidden="true" class="text-lg">🟦</span>
        Sudoku
      </RouterLink>
      <nav class="flex flex-1 items-center gap-4 text-sm" aria-label="Main">
        <RouterLink :to="{ name: 'play.new' }" class="hover:underline">Play</RouterLink>
        <RouterLink :to="{ name: 'daily' }" class="hover:underline">Daily</RouterLink>
        <RouterLink :to="{ name: 'leaderboards.default' }" class="hover:underline">
          Leaderboards
        </RouterLink>
        <template v-if="auth.isAuthenticated">
          <RouterLink :to="{ name: 'stats' }" class="hover:underline">Stats</RouterLink>
        </template>
      </nav>
      <div class="flex items-center gap-2">
        <ThemeToggle />
        <template v-if="auth.isAuthenticated">
          <RouterLink
            :to="{ name: 'profile' }"
            class="text-sm font-medium hover:underline"
            data-testid="header-displayName"
          >
            {{ displayName }}
          </RouterLink>
          <AppButton size="sm" variant="ghost" data-testid="header-logout" @click="onLogout">
            Sign out
          </AppButton>
        </template>
        <template v-else>
          <RouterLink :to="{ name: 'login' }">
            <AppButton size="sm" variant="secondary">Sign in</AppButton>
          </RouterLink>
          <RouterLink :to="{ name: 'register' }">
            <AppButton size="sm">Register</AppButton>
          </RouterLink>
        </template>
      </div>
    </div>
  </header>
</template>
