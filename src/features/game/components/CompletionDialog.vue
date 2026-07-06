<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

import AppButton from '@/shared/ui/AppButton.vue';
import AppModal from '@/shared/ui/AppModal.vue';
import { formatElapsed } from '@/shared/composables/useTimer';
import { useAuthStore } from '@/features/auth/store/authStore';

interface Props {
  open: boolean;
  isCorrect: boolean;
  elapsedMs: number | null;
  mistakeCount: number;
  isAssisted: boolean;
  leaderboardEntryCreated: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'view-leaderboard'): void;
  (e: 'new-game'): void;
}>();

const auth = useAuthStore();

const elapsedLabel = computed(() =>
  props.elapsedMs !== null ? formatElapsed(props.elapsedMs) : '—',
);

const showSignInPrompt = computed(
  () => props.isCorrect && !props.leaderboardEntryCreated && !auth.isAuthenticated,
);
</script>

<template>
  <AppModal
    :open="props.open"
    :title="props.isCorrect ? '🎉 Puzzle solved!' : 'Not quite right'"
    data-testid="completion-dialog"
    @close="emit('close')"
  >
    <p v-if="props.isCorrect">Nice work — you completed the puzzle.</p>
    <p v-else>
      Some cells are still wrong. Review the board for conflicts and try submitting again.
    </p>
    <dl v-if="props.isCorrect" class="stats" data-testid="completion-stats">
      <div>
        <dt>Time</dt>
        <dd data-testid="stat-time">{{ elapsedLabel }}</dd>
      </div>
      <div>
        <dt>Conflicts</dt>
        <dd data-testid="stat-mistakes">{{ props.mistakeCount }}</dd>
      </div>
      <div v-if="props.isAssisted">
        <dt>Assisted</dt>
        <dd>Yes (hints used)</dd>
      </div>
      <div v-if="props.leaderboardEntryCreated">
        <dt>Leaderboard</dt>
        <dd>Entry recorded ✔</dd>
      </div>
    </dl>
    <p
      v-if="showSignInPrompt"
      class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
      data-testid="completion-sign-in-prompt"
    >
      <RouterLink
        :to="{ name: 'login' }"
        class="font-medium underline"
        @click="emit('close')"
      >Sign in</RouterLink>
      to record your scores on the leaderboard.
    </p>
    <template #footer>
      <AppButton variant="secondary" @click="emit('close')">Close</AppButton>
      <AppButton
        v-if="props.isCorrect && props.leaderboardEntryCreated"
        variant="secondary"
        data-testid="btn-view-leaderboard"
        @click="emit('view-leaderboard')"
      >
        View leaderboard
      </AppButton>
      <AppButton
        v-if="props.isCorrect"
        variant="primary"
        data-testid="btn-new-game"
        @click="emit('new-game')"
      >
        New game
      </AppButton>
    </template>
  </AppModal>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1.25rem;
  margin-top: 0.75rem;
}
.stats div {
  display: flex;
  flex-direction: column;
}
.stats dt {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stats dd {
  font-weight: 600;
  font-size: 1rem;
  margin: 0;
}
</style>
