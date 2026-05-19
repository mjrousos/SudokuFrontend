import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatElapsed, useTimer } from './useTimer';

// ---------------------------------------------------------------------------
// Helper: mount a minimal component so onMounted / onBeforeUnmount fire.
// ---------------------------------------------------------------------------
function withTimer(options: Parameters<typeof useTimer>[0]) {
  let handle!: ReturnType<typeof useTimer>;
  const Comp = defineComponent({
    setup() {
      handle = useTimer(options);
      return () => h('div');
    },
  });
  const wrapper = mount(Comp);
  return { handle, wrapper };
}

describe('formatElapsed', () => {
  it.each<[number, string]>([
    [0, '00:00'],
    [999, '00:00'],
    [1_000, '00:01'],
    [59_000, '00:59'],
    [60_000, '01:00'],
    [125_000, '02:05'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [3_661_500, '1:01:01'],
    [-1_000, '00:00'],
  ])('formats %i ms as %s', (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });
});

describe('useTimer — reset()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets elapsedMs to the provided value', async () => {
    const { handle, wrapper } = withTimer({ startedAt: new Date(), autoStart: false });
    expect(handle.elapsedMs.value).toBe(0);

    handle.reset({ startedAt: new Date(), elapsedMs: 1_800_000 });

    expect(handle.elapsedMs.value).toBe(1_800_000);
    wrapper.unmount();
  });

  it('defaults elapsedMs to 0 when omitted', () => {
    const { handle, wrapper } = withTimer({
      startedAt: new Date(),
      initialElapsedMs: 5_000,
      autoStart: false,
    });
    handle.reset({ startedAt: new Date() });
    expect(handle.elapsedMs.value).toBe(0);
    wrapper.unmount();
  });

  it('preserves paused state — does not auto-start', () => {
    const { handle, wrapper } = withTimer({ startedAt: new Date(), autoStart: false });
    expect(handle.isRunning.value).toBe(false);

    handle.reset({ startedAt: new Date(), elapsedMs: 60_000 });

    expect(handle.isRunning.value).toBe(false);
    wrapper.unmount();
  });

  it('preserves running state and keeps ticking with the new baseline', async () => {
    const { handle, wrapper } = withTimer({ startedAt: new Date(), autoStart: true });
    expect(handle.isRunning.value).toBe(true);

    // Reset to a baseline 30 minutes in the past with 30 min already elapsed.
    handle.reset({ startedAt: new Date(Date.now() - 30_000), elapsedMs: 1_800_000 });

    expect(handle.elapsedMs.value).toBe(1_800_000);
    expect(handle.isRunning.value).toBe(true);

    // Advance the fake clock by 1 s — elapsed should increase.
    vi.advanceTimersByTime(1_000);
    await nextTick();

    expect(handle.elapsedMs.value).toBeGreaterThanOrEqual(1_801_000);

    wrapper.unmount();
  });

  it('formatted value reflects the reset baseline', () => {
    const { handle, wrapper } = withTimer({ startedAt: new Date(), autoStart: false });
    handle.reset({ startedAt: new Date(), elapsedMs: 3_661_000 }); // 1 h 1 min 1 s
    expect(handle.formatted.value).toBe('1:01:01');
    wrapper.unmount();
  });

  it('accepts an ISO string for startedAt (server timestamps)', () => {
    const iso = new Date(Date.now() - 60_000).toISOString();
    const { handle, wrapper } = withTimer({ startedAt: new Date(), autoStart: false });
    expect(() => handle.reset({ startedAt: iso, elapsedMs: 60_000 })).not.toThrow();
    expect(handle.elapsedMs.value).toBe(60_000);
    wrapper.unmount();
  });

  it('useTimer constructor accepts an ISO string for startedAt', () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    const { handle, wrapper } = withTimer({ startedAt: iso, initialElapsedMs: 30_000, autoStart: false });
    expect(handle.elapsedMs.value).toBe(30_000);
    wrapper.unmount();
  });
});

