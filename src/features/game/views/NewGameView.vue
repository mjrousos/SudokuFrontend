<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import AppButton from '@/shared/ui/AppButton.vue';
import AppSpinner from '@/shared/ui/AppSpinner.vue';
import { useToastStore } from '@/shared/ui/toastStore';
import { ApiError } from '@/shared/api/problemDetails';
import {
  DIFFICULTIES,
  Difficulty,
  GameMode,
} from '@/shared/api/types';
import { useGamesStore } from '@/features/game/store/gamesStore';
import { useAuthStore } from '@/features/auth/store/authStore';

const router = useRouter();
const games = useGamesStore();
const toasts = useToastStore();
const auth = useAuthStore();

const mode = ref<GameMode>(GameMode.Practice);
const difficulty = ref<Difficulty>(Difficulty.Easy);
const submitting = ref(false);
const error = ref<string | null>(null);

async function startGame(): Promise<void> {
  submitting.value = true;
  error.value = null;
  try {
    const game = await games.createGame({ mode: mode.value, difficulty: difficulty.value });
    await router.push({ name: 'play.game', params: { gameId: game.gameId } });
  } catch (err) {
    if (err instanceof ApiError) {
      error.value = err.detail ?? err.title ?? 'Could not start a new game.';
      if (err.status === 503) {
        toasts.error('Puzzle generator is busy. Try a different difficulty or retry.');
      }
    } else {
      error.value = 'Could not start a new game.';
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="mx-auto max-w-md space-y-6">
    <header>
      <h1 class="text-2xl font-semibold">Start a new game</h1>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Practice freely or try Ranked for a chance to make the leaderboard.
      </p>
    </header>

    <p v-if="!auth.isAuthenticated" class="text-sm text-slate-600 dark:text-slate-300" data-testid="anon-notice">
      You&#39;re playing as a guest.
      <RouterLink :to="{ name: 'login', query: { redirectTo: '/play' } }" class="text-blue-600 underline hover:text-blue-700 dark:text-blue-400">
        Sign in
      </RouterLink>
      to have your scores tracked and appear on the leaderboard.
    </p>

    <form class="space-y-5" @submit.prevent="startGame">
      <fieldset>
        <legend class="text-sm font-medium">Mode</legend>
        <div class="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Game mode">
          <label
            v-for="m in [GameMode.Practice, GameMode.Ranked]"
            :key="m"
            class="flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium ring-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2"
            :data-testid="`mode-${m}`"
          >
            <input
              v-model="mode"
              type="radio"
              :value="m"
              class="sr-only"
              :aria-label="m"
            />
            <span>{{ m }}</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend class="text-sm font-medium">Difficulty</legend>
        <div class="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Difficulty">
          <label
            v-for="d in DIFFICULTIES"
            :key="d"
            class="flex cursor-pointer items-center justify-center rounded-md border px-2 py-2 text-sm font-medium ring-blue-500 has-[:checked]:bg-blue-50 has-[:checked]:ring-2"
            :data-testid="`difficulty-${d}`"
          >
            <input
              v-model="difficulty"
              type="radio"
              :value="d"
              class="sr-only"
              :aria-label="d"
            />
            <span>{{ d }}</span>
          </label>
        </div>
      </fieldset>

      <p v-if="error" class="text-sm text-rose-600" role="alert" data-testid="newgame-error">
        {{ error }}
      </p>

      <div class="flex items-center gap-3">
        <AppButton type="submit" :loading="submitting" data-testid="btn-start">
          Start
        </AppButton>
        <AppSpinner v-if="submitting" />
      </div>
    </form>
  </section>
</template>
