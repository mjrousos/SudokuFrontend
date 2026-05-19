<script setup lang="ts">
interface Props {
  pencilMode?: boolean;
  disabled?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  pencilMode: false,
  disabled: false,
});
const emit = defineEmits<{
  (e: 'digit', value: number): void;
  (e: 'clear'): void;
  (e: 'pencil-toggle'): void;
}>();

const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
</script>

<template>
  <div class="number-pad" role="group" aria-label="Number pad">
    <button
      v-for="n in digits"
      :key="n"
      type="button"
      class="pad-key"
      :disabled="props.disabled"
      :data-testid="`pad-${n}`"
      @click="emit('digit', n)"
    >
      {{ n }}
    </button>
    <button
      type="button"
      class="pad-key pad-clear"
      :disabled="props.disabled"
      data-testid="pad-clear"
      @click="emit('clear')"
    >
      ⌫
    </button>
    <button
      type="button"
      class="pad-key pad-pencil"
      :aria-pressed="props.pencilMode"
      :disabled="props.disabled"
      data-testid="pad-pencil"
      @click="emit('pencil-toggle')"
    >
      ✎
      <span class="sr">{{ props.pencilMode ? 'pencil on' : 'pencil off' }}</span>
    </button>
  </div>
</template>

<style scoped>
.number-pad {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  max-width: 14rem;
}
.pad-key {
  height: 3rem;
  font-size: 1.25rem;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
}
.pad-key:hover:not(:disabled) {
  background: #e5e7eb;
}
.pad-key:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pad-pencil[aria-pressed='true'] {
  background: #1d4ed8;
  color: white;
}
.sr {
  position: absolute;
  left: -9999px;
}
</style>
