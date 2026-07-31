<script setup lang="ts">
import AppModal from '@/shared/ui/AppModal.vue';

defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();

const shortcuts = [
  { keys: ['←', '→', '↑', '↓'], description: 'Move between cells' },
  { keys: ['1', '2', '…', '9'], description: 'Place a digit' },
  { keys: ['0', 'Del', '⌫'], description: 'Clear cell' },
  { keys: ['N', 'P'], description: 'Toggle pencil / notes mode' },
  { keys: ['?'], description: 'Show this help' },
] as const;
</script>

<template>
  <AppModal :open="open" title="Keyboard Shortcuts" data-testid="shortcuts-modal" @close="$emit('close')">
    <table class="w-full text-sm">
      <tbody>
        <tr
          v-for="(s, i) in shortcuts"
          :key="i"
          class="border-b border-slate-100 last:border-0 dark:border-slate-800"
        >
          <td class="py-2 pr-4">
            <span class="flex flex-wrap gap-1">
              <kbd
                v-for="k in s.keys"
                :key="k"
                class="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {{ k }}
              </kbd>
            </span>
          </td>
          <td class="py-2 text-slate-600 dark:text-slate-400">{{ s.description }}</td>
        </tr>
      </tbody>
    </table>
  </AppModal>
</template>
