import { computed, onBeforeUnmount, onMounted, readonly, ref } from 'vue';

interface UseTimerOptions {
  /** Time on the server at the moment the timer was created. Accepts a Date,
   * ms-since-epoch number, or ISO date string. */
  startedAt: Date | number | string;
  /** Elapsed time from the server at the moment of construction, in ms. */
  initialElapsedMs?: number;
  /** Whether the timer should start running immediately. Default true. */
  autoStart?: boolean;
  /** Tick interval, ms. Default 1000 (every second). */
  tickMs?: number;
}

interface TimerHandle {
  /** Elapsed time, in ms. Updates on each tick. */
  elapsedMs: Readonly<{ value: number }>;
  /** Same value formatted as `mm:ss` or `hh:mm:ss`. */
  formatted: Readonly<{ value: string }>;
  start: () => void;
  pause: () => void;
  stop: () => void;
  /**
   * Re-anchor the timer to a new server baseline. If the timer is currently
   * running it stays running (and immediately picks up the new baseline);
   * if it is paused it stays paused.
   */
  reset: (opts: { startedAt: Date | number | string; elapsedMs?: number }) => void;
  isRunning: Readonly<{ value: boolean }>;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function toMs(value: Date | number | string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return value.getTime();
}

export function useTimer(options: UseTimerOptions): TimerHandle {
  let startedAtMs = toMs(options.startedAt);
  const initialElapsedMs = options.initialElapsedMs ?? 0;
  const tickMs = options.tickMs ?? 1000;
  let offsetAtMount = Date.now() - (startedAtMs + initialElapsedMs);

  const elapsedMs = ref(initialElapsedMs);
  const isRunning = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function recompute(): void {
    elapsedMs.value = Math.max(0, Date.now() - startedAtMs - offsetAtMount);
  }

  function start(): void {
    if (isRunning.value) return;
    isRunning.value = true;
    recompute();
    intervalId = setInterval(recompute, tickMs);
  }
  function pause(): void {
    if (!isRunning.value) return;
    isRunning.value = false;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
  function stop(): void {
    pause();
  }

  function reset(opts: { startedAt: Date | number | string; elapsedMs?: number }): void {
    startedAtMs = toMs(opts.startedAt);
    const newElapsedMs = opts.elapsedMs ?? 0;
    elapsedMs.value = newElapsedMs;
    offsetAtMount = Date.now() - (startedAtMs + newElapsedMs);
    if (isRunning.value) {
      // Re-anchor the running interval to the new baseline.
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      recompute();
      intervalId = setInterval(recompute, tickMs);
    }
  }

  onMounted(() => {
    if (options.autoStart !== false) start();
  });
  onBeforeUnmount(() => stop());

  return {
    elapsedMs: readonly(elapsedMs),
    formatted: readonly(computed(() => formatElapsed(elapsedMs.value))) as unknown as Readonly<{
      value: string;
    }>,
    isRunning: readonly(isRunning),
    start,
    pause,
    stop,
    reset,
  };
}

export { formatElapsed };
