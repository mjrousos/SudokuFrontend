<script setup lang="ts">
import { computed } from 'vue';

import AppButton from '@/shared/ui/AppButton.vue';
import { GameMode, type GameStatus } from '@/shared/api/types';

interface Props {
  mode: GameMode;
  status: GameStatus;
  elapsedFormatted: string;
  hintCount: number;
  mistakeCount: number;
  paused: boolean;
  submitDisabled?: boolean;
}
const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'toggle-pause'): void;
  (e: 'hint'): void;
  (e: 'submit'): void;
  (e: 'abandon'): void;
}>();

const pauseLabel = computed(() => {
  if (props.mode === GameMode.Practice) return props.paused ? 'Resume' : 'Pause';
  return props.paused ? 'Show board' : 'Hide board';
});
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Game toolbar">
    <div class="toolbar-info">
      <span class="info-pill" data-testid="toolbar-timer" aria-label="Elapsed time">
        ⏱ {{ props.elapsedFormatted }}
      </span>
      <span class="info-pill" data-testid="toolbar-hints" aria-label="Hints used">
        💡 {{ props.hintCount }}
      </span>
      <span class="info-pill" data-testid="toolbar-mistakes" aria-label="Conflicts so far">
        ⚠ {{ props.mistakeCount }}
      </span>
    </div>
    <div class="toolbar-actions">
      <AppButton
        variant="secondary"
        data-testid="btn-pause"
        :aria-pressed="props.paused"
        @click="emit('toggle-pause')"
      >
        {{ pauseLabel }}
      </AppButton>
      <AppButton variant="secondary" data-testid="btn-hint" @click="emit('hint')">
        Hint
      </AppButton>
      <AppButton
        variant="primary"
        data-testid="btn-submit"
        :disabled="props.submitDisabled"
        @click="emit('submit')"
      >
        Submit
      </AppButton>
      <AppButton variant="danger" data-testid="btn-abandon" @click="emit('abandon')">
        Abandon
      </AppButton>
    </div>
    <p v-if="props.mode !== GameMode.Practice" class="hint-text">
      Timer is server-side for {{ props.mode }} mode. Hiding the board pauses your screen
      only.
    </p>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}
.toolbar-info {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.info-pill {
  background: white;
  border: 1px solid #d1d5db;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.875rem;
}
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.hint-text {
  font-size: 0.75rem;
  color: #6b7280;
}
</style>
