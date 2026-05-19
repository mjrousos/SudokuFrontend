import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import SudokuBoard from './SudokuBoard.vue';
import { decodeBoard } from '@/shared/sudoku/boardCodec';
import { GameMoveEvaluation } from '@/shared/api/types';

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function makeGrid(currentBoard: string = GIVENS) {
  return decodeBoard(currentBoard, GIVENS);
}

describe('SudokuBoard', () => {
  it('renders 81 cells with the right values', () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, {
      props: { grid, selected: null },
    });
    const cells = wrapper.findAll('[role="gridcell"]');
    expect(cells.length).toBe(81);
    // (0,0) given is 5
    expect(wrapper.get('[data-testid="cell-0-0"]').text()).toBe('5');
    // (0,2) is empty (0 in givens) -> renders nothing
    expect(wrapper.get('[data-testid="cell-0-2"]').text()).toBe('');
  });

  it('marks given cells with the given class and data attribute', () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: null } });
    const given = wrapper.get('[data-testid="cell-0-0"]');
    expect(given.classes()).toContain('given');
    expect(given.attributes('data-given')).toBeDefined();
    const empty = wrapper.get('[data-testid="cell-0-2"]');
    expect(empty.classes()).not.toContain('given');
    expect(empty.attributes('data-given')).toBeUndefined();
  });

  it('emits select(row, col) when a cell is clicked', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: null } });
    await wrapper.get('[data-testid="cell-2-4"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual([2, 4]);
  });

  it('does not emit select when disabled', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, {
      props: { grid, selected: null, disabled: true },
    });
    await wrapper.get('[data-testid="cell-2-4"]').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('highlights the selected cell and its peers (row/col/box)', () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [4, 4] } });
    expect(wrapper.get('[data-testid="cell-4-4"]').classes()).toContain('selected');
    // Same row
    expect(wrapper.get('[data-testid="cell-4-0"]').classes()).toContain('peer');
    // Same column
    expect(wrapper.get('[data-testid="cell-0-4"]').classes()).toContain('peer');
    // Same 3x3 box
    expect(wrapper.get('[data-testid="cell-3-3"]').classes()).toContain('peer');
    // Outside row/col/box: not a peer.
    expect(wrapper.get('[data-testid="cell-0-0"]').classes()).not.toContain('peer');
  });

  it('marks duplicate values as conflict cells', () => {
    // Add a 5 at (0,2) where row 0 already has 5 at (0,0) → both are conflicts.
    const board = GIVENS.slice(0, 2) + '5' + GIVENS.slice(3);
    const grid = makeGrid(board);
    const wrapper = mount(SudokuBoard, { props: { grid, selected: null } });
    expect(wrapper.get('[data-testid="cell-0-0"]').classes()).toContain('conflict');
    expect(wrapper.get('[data-testid="cell-0-2"]').classes()).toContain('conflict');
  });

  it('renders the inconsistent class when a cell carries Inconsistent evaluation', () => {
    const grid = makeGrid();
    // Mutate cell (0,2) with a value and an evaluation flag.
    const cell = grid[0]![2]!;
    grid[0]![2] = { ...cell, value: 8, evaluation: GameMoveEvaluation.Inconsistent };
    const wrapper = mount(SudokuBoard, { props: { grid, selected: null } });
    expect(wrapper.get('[data-testid="cell-0-2"]').classes()).toContain('inconsistent');
  });

  it('renders pencil notes for empty cells', () => {
    const grid = makeGrid();
    const cell = grid[0]![2]!;
    grid[0]![2] = { ...cell, notes: new Set([1, 5, 9]) };
    const wrapper = mount(SudokuBoard, { props: { grid, selected: null } });
    const target = wrapper.get('[data-testid="cell-0-2"]');
    expect(target.text()).toContain('1');
    expect(target.text()).toContain('5');
    expect(target.text()).toContain('9');
  });

  // ---------------------------------------------------------------------------
  // Roving tabindex
  // ---------------------------------------------------------------------------

  it('gives the selected cell tabindex=0 and all others tabindex=-1', () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [4, 4] } });
    expect(wrapper.get('[data-testid="cell-4-4"]').attributes('tabindex')).toBe('0');
    expect(wrapper.get('[data-testid="cell-0-0"]').attributes('tabindex')).toBe('-1');
    expect(wrapper.get('[data-testid="cell-8-8"]').attributes('tabindex')).toBe('-1');
  });

  it('gives cell [0,0] tabindex=0 when nothing is selected (Tab-entry fallback)', () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: null } });
    expect(wrapper.get('[data-testid="cell-0-0"]').attributes('tabindex')).toBe('0');
    expect(wrapper.get('[data-testid="cell-4-4"]').attributes('tabindex')).toBe('-1');
  });

  // ---------------------------------------------------------------------------
  // Keyboard navigation — arrow keys emit select
  // ---------------------------------------------------------------------------

  it('ArrowRight on the board emits select with the next column', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [4, 4] } });
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('select')?.[0]).toEqual([4, 5]);
  });

  it('ArrowDown on the board emits select with the next row', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [4, 4] } });
    await wrapper.trigger('keydown', { key: 'ArrowDown' });
    expect(wrapper.emitted('select')?.[0]).toEqual([5, 4]);
  });

  it('ArrowLeft at column 0 clamps and still emits select', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [4, 0] } });
    await wrapper.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('select')?.[0]).toEqual([4, 0]);
  });

  // ---------------------------------------------------------------------------
  // Keyboard — digit / clear / pencil-toggle events
  // ---------------------------------------------------------------------------

  it('pressing a digit key emits the digit event', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [0, 2] } });
    await wrapper.trigger('keydown', { key: '5' });
    expect(wrapper.emitted('digit')?.[0]).toEqual([5]);
  });

  it('pressing Delete emits the clear event', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [0, 2] } });
    await wrapper.trigger('keydown', { key: 'Delete' });
    expect(wrapper.emitted('clear')).toBeTruthy();
  });

  it('pressing p emits the pencil-toggle event', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [0, 2] } });
    await wrapper.trigger('keydown', { key: 'p' });
    expect(wrapper.emitted('pencil-toggle')).toBeTruthy();
  });

  it('does not emit keyboard events when disabled', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, { props: { grid, selected: [4, 4], disabled: true } });
    await wrapper.trigger('keydown', { key: 'ArrowRight' });
    await wrapper.trigger('keydown', { key: '5' });
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.emitted('digit')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Focus follows selection
  // ---------------------------------------------------------------------------

  it('focuses the newly selected cell after props.selected changes', async () => {
    const grid = makeGrid();
    const wrapper = mount(SudokuBoard, {
      props: { grid, selected: [0, 0] },
      attachTo: document.body,
    });

    await wrapper.setProps({ selected: [2, 3] });
    await nextTick(); // allow inner nextTick in the watcher to settle

    const focused = document.activeElement;
    expect(focused?.getAttribute('data-testid')).toBe('cell-2-3');

    wrapper.unmount();
  });
});
