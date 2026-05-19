import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  /** Auto-dismiss after this many ms. Pass 0 to keep until manually closed. */
  timeoutMs: number;
}

let nextId = 0;

export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([]);

  function push(kind: ToastKind, message: string, timeoutMs = 4000): string {
    const id = String(++nextId);
    toasts.value.push({ id, kind, message, timeoutMs });
    if (timeoutMs > 0) {
      setTimeout(() => dismiss(id), timeoutMs);
    }
    return id;
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  const success = (msg: string, timeout?: number) => push('success', msg, timeout);
  const info = (msg: string, timeout?: number) => push('info', msg, timeout);
  const warning = (msg: string, timeout?: number) => push('warning', msg, timeout);
  const error = (msg: string, timeout?: number) => push('error', msg, timeout ?? 6000);

  return {
    toasts: computed(() => toasts.value),
    push,
    dismiss,
    success,
    info,
    warning,
    error,
  };
});
