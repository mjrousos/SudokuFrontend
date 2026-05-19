import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

import { useTimer } from './useTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

function makeHostComponent(options: Parameters<typeof useTimer>[0]) {
  return defineComponent({
    setup() {
      const handle = useTimer(options);
      return { handle };
    },
    render() {
      return h('div', this.handle.formatted.value);
    },
  });
}

describe('useTimer composable', () => {
  it('auto-starts and ticks every second by default', async () => {
    const Comp = makeHostComponent({ startedAt: Date.now() });
    const wrapper = mount(Comp);

    expect(wrapper.vm.handle.isRunning.value).toBe(true);
    expect(wrapper.vm.handle.elapsedMs.value).toBe(0);

    await vi.advanceTimersByTimeAsync(2_500);
    await nextTick();

    expect(wrapper.vm.handle.elapsedMs.value).toBeGreaterThanOrEqual(2_000);
    expect(wrapper.vm.handle.elapsedMs.value).toBeLessThan(3_000);
    expect(wrapper.vm.handle.formatted.value).toBe('00:02');

    wrapper.unmount();
  });

  it('honors initialElapsedMs and a custom tickMs interval', async () => {
    const startedAt = Date.now() - 30_000;
    const Comp = makeHostComponent({ startedAt, initialElapsedMs: 30_000, tickMs: 500 });
    const wrapper = mount(Comp);

    expect(wrapper.vm.handle.elapsedMs.value).toBe(30_000);

    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();

    expect(wrapper.vm.handle.elapsedMs.value).toBeGreaterThanOrEqual(31_000);
    expect(wrapper.vm.handle.elapsedMs.value).toBeLessThan(32_000);

    wrapper.unmount();
  });

  it('does not start when autoStart is false and only starts on explicit start()', async () => {
    const Comp = makeHostComponent({ startedAt: Date.now(), autoStart: false });
    const wrapper = mount(Comp);

    expect(wrapper.vm.handle.isRunning.value).toBe(false);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(wrapper.vm.handle.elapsedMs.value).toBe(0);

    wrapper.vm.handle.start();
    expect(wrapper.vm.handle.isRunning.value).toBe(true);

    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();
    expect(wrapper.vm.handle.elapsedMs.value).toBeGreaterThanOrEqual(1_000);

    wrapper.unmount();
  });

  it('pause stops the ticks; start is idempotent', async () => {
    const Comp = makeHostComponent({ startedAt: Date.now() });
    const wrapper = mount(Comp);

    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();
    const beforePause = wrapper.vm.handle.elapsedMs.value;

    wrapper.vm.handle.pause();
    expect(wrapper.vm.handle.isRunning.value).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    await nextTick();
    expect(wrapper.vm.handle.elapsedMs.value).toBe(beforePause);

    wrapper.vm.handle.start();
    wrapper.vm.handle.start();
    expect(wrapper.vm.handle.isRunning.value).toBe(true);

    wrapper.unmount();
  });

  it('stop() pauses and pause() before start() is a no-op', () => {
    const Comp = makeHostComponent({ startedAt: Date.now(), autoStart: false });
    const wrapper = mount(Comp);

    wrapper.vm.handle.pause();
    expect(wrapper.vm.handle.isRunning.value).toBe(false);

    wrapper.vm.handle.start();
    wrapper.vm.handle.stop();
    expect(wrapper.vm.handle.isRunning.value).toBe(false);

    wrapper.unmount();
  });

  it('accepts a Date startedAt and clears the interval on unmount', async () => {
    const startedAt = new Date('2024-01-01T00:00:00Z');
    const Comp = makeHostComponent({ startedAt });
    const wrapper = mount(Comp);

    await vi.advanceTimersByTimeAsync(1_000);
    await nextTick();

    expect(wrapper.vm.handle.elapsedMs.value).toBeGreaterThanOrEqual(1_000);

    wrapper.unmount();
    // After unmount, advancing the clock should not mutate any reactive state
    // (we cannot read it, but absence of "leak" timers is the assertion — vi
    // would flag stray timer queues with vi.runAllTimers if anything remained).
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
