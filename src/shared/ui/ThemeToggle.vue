<script setup lang="ts">
import { computed } from 'vue';

import { useTheme, type ThemePreference } from '@/shared/composables/useTheme';

const theme = useTheme();

interface ModeMeta {
  label: string;
  next: ThemePreference;
  // Human-readable name of the *next* mode for the aria-label, so screen
  // reader users hear what clicking will do.
  nextLabel: string;
}

const META: Record<ThemePreference, ModeMeta> = {
  light: { label: 'Light', next: 'dark', nextLabel: 'Dark' },
  dark: { label: 'Dark', next: 'system', nextLabel: 'System' },
  system: { label: 'System', next: 'light', nextLabel: 'Light' },
};

const current = computed(() => META[theme.preference.value]);

function onClick(): void {
  theme.cyclePreference();
}
</script>

<template>
  <button
    type="button"
    class="inline-flex h-9 w-9 select-none items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-slate-200 dark:hover:bg-slate-800"
    :aria-label="`Theme: ${current.label}. Click to switch to ${current.nextLabel}.`"
    :title="`Theme: ${current.label}`"
    data-testid="theme-toggle"
    :data-theme-preference="theme.preference.value"
    :data-theme-resolved="theme.resolved.value"
    @click="onClick"
  >
    <!-- Sun (Light) -->
    <svg
      v-if="theme.preference.value === 'light'"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-5 w-5"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
    <!-- Moon (Dark) -->
    <svg
      v-else-if="theme.preference.value === 'dark'"
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-5 w-5"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
    <!-- Laptop (System) -->
    <svg
      v-else
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-5 w-5"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M2 20h20" />
    </svg>
    <span class="sr-only" aria-live="polite">Theme: {{ current.label }}</span>
  </button>
</template>
