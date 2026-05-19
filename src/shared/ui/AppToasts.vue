<script setup lang="ts">
import { useToastStore } from './toastStore';

const toasts = useToastStore();

const kindClasses: Record<string, string> = {
  success: 'bg-emerald-600 text-white',
  info: 'bg-sky-600 text-white',
  warning: 'bg-amber-500 text-slate-900',
  error: 'bg-rose-600 text-white',
};
</script>

<template>
  <div
    aria-live="polite"
    aria-atomic="true"
    class="pointer-events-none fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
  >
    <transition-group name="toast" tag="div" class="flex flex-col gap-2">
      <div
        v-for="t in toasts.toasts"
        :key="t.id"
        :class="['pointer-events-auto rounded-md px-4 py-3 shadow-lg', kindClasses[t.kind]]"
        role="status"
      >
        <div class="flex items-start gap-3">
          <p class="flex-1 text-sm leading-snug">{{ t.message }}</p>
          <button
            type="button"
            class="text-xs uppercase tracking-wide opacity-80 hover:opacity-100"
            :aria-label="`Dismiss ${t.kind} notification`"
            @click="toasts.dismiss(t.id)"
          >
            close
          </button>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
