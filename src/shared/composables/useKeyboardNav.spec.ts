import { describe, expect, it } from 'vitest';

import {
  parseKeyEvent,
  moveCursor,
  type DirectionKey,
} from './useKeyboardNav';

function key(k: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: k, ...modifiers });
}

describe('parseKeyEvent', () => {
  it.each<[string, ReturnType<typeof parseKeyEvent>]>([
    ['ArrowUp', { kind: 'move', dir: 'ArrowUp' }],
    ['ArrowDown', { kind: 'move', dir: 'ArrowDown' }],
    ['ArrowLeft', { kind: 'move', dir: 'ArrowLeft' }],
    ['ArrowRight', { kind: 'move', dir: 'ArrowRight' }],
    ['1', { kind: 'digit', value: 1 }],
    ['9', { kind: 'digit', value: 9 }],
    ['0', { kind: 'clear' }],
    ['Delete', { kind: 'clear' }],
    ['Backspace', { kind: 'clear' }],
    ['n', { kind: 'pencil-toggle' }],
    ['N', { kind: 'pencil-toggle' }],
    ['?', { kind: 'help' }],
    ['/', { kind: 'help' }],
    ['Tab', null],
    ['Enter', null],
    ['a', null],
  ])('parses %s correctly', (k, expected) => {
    expect(parseKeyEvent(key(k))).toEqual(expected);
  });

  it('ignores keys when Ctrl/Meta/Alt is held', () => {
    expect(parseKeyEvent(key('1', { ctrlKey: true }))).toBeNull();
    expect(parseKeyEvent(key('1', { metaKey: true }))).toBeNull();
    expect(parseKeyEvent(key('1', { altKey: true }))).toBeNull();
  });
});

describe('moveCursor', () => {
  it.each<[[number, number], DirectionKey, [number, number]]>([
    [[4, 4], 'ArrowUp', [3, 4]],
    [[4, 4], 'ArrowDown', [5, 4]],
    [[4, 4], 'ArrowLeft', [4, 3]],
    [[4, 4], 'ArrowRight', [4, 5]],
    // Clamping at edges
    [[0, 0], 'ArrowUp', [0, 0]],
    [[0, 0], 'ArrowLeft', [0, 0]],
    [[8, 8], 'ArrowDown', [8, 8]],
    [[8, 8], 'ArrowRight', [8, 8]],
  ])('from %j moving %s -> %j', (start, dir, expected) => {
    expect(moveCursor(start, dir)).toEqual(expected);
  });
});
