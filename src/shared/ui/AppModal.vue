<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface Props {
  open: boolean;
  title?: string;
  closeOnBackdrop?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: undefined,
  closeOnBackdrop: true,
});

defineOptions({ inheritAttrs: false });

const emit = defineEmits<{ close: [] }>();

const dialogEl = ref<HTMLDivElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && !el.closest('[hidden]'),
  );
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

function onDialogKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !dialogEl.value) return;
  const focusable = getFocusable(dialogEl.value);
  if (focusable.length === 0) {
    e.preventDefault();
    dialogEl.value.focus();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey);
  if (typeof document !== 'undefined' && props.open) {
    document.body.style.overflow = '';
    previouslyFocused?.focus();
  }
});

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = isOpen ? 'hidden' : '';
    if (isOpen) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      nextTick(() => {
        if (!dialogEl.value) return;
        const focusable = getFocusable(dialogEl.value);
        if (focusable.length > 0) {
          focusable[0]!.focus();
        } else {
          dialogEl.value.focus();
        }
      });
    } else {
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  },
);
</script>

<template>
  <Teleport to="body">
    <transition name="modal">
      <div
        v-if="open"
        ref="dialogEl"
        class="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4"
        role="dialog"
        aria-modal="true"
        :aria-label="title ?? 'Dialog'"
        tabindex="-1"
        v-bind="$attrs"
        @click.self="closeOnBackdrop && $emit('close')"
        @keydown="onDialogKeydown"
      >
        <div
          class="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900"
        >
          <header v-if="title || $slots.header" class="mb-4 flex items-center justify-between">
            <slot name="header">
              <h2 class="text-lg font-semibold">{{ title }}</h2>
            </slot>
            <button
              type="button"
              class="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              aria-label="Close"
              @click="$emit('close')"
            >
              ✕
            </button>
          </header>
          <slot />
          <footer v-if="$slots.footer" class="mt-6 flex justify-end gap-2">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 180ms ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
