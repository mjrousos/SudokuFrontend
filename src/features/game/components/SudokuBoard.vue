<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { computeHighlight, findConflicts } from '@/shared/sudoku/conflicts';
import { BOARD_SIZE, BOX_SIZE, type Cell, type Grid } from '@/shared/sudoku/types';
import { GameMoveEvaluation } from '@/shared/api/types';
import { moveCursor, parseKeyEvent } from '@/shared/composables/useKeyboardNav';

interface Props {
  grid: Grid;
  selected: [number, number] | null;
  pencilMode?: boolean;
  disabled?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  pencilMode: false,
  disabled: false,
});

const emit = defineEmits<{
  (e: 'select', row: number, col: number): void;
  (e: 'digit', value: number): void;
  (e: 'clear'): void;
  (e: 'pencil-toggle'): void;
}>();

const boardRoot = ref<HTMLElement | null>(null);

const conflicts = computed(() => findConflicts(props.grid));
const highlight = computed(() => computeHighlight(props.grid, props.selected));

function key(row: number, col: number): string {
  return `${row},${col}`;
}

function isSelected(cell: Cell): boolean {
  return (
    props.selected !== null &&
    props.selected[0] === cell.row &&
    props.selected[1] === cell.col
  );
}

function cellTabIndex(cell: Cell): 0 | -1 {
  if (props.selected !== null) {
    return isSelected(cell) ? 0 : -1;
  }
  // Fallback: make cell [0,0] reachable by Tab when nothing is selected.
  return cell.row === 0 && cell.col === 0 ? 0 : -1;
}

function cellClasses(cell: Cell): string[] {
  const classes = ['board-cell'];
  if (cell.given) classes.push('given');
  if (isSelected(cell)) classes.push('selected');
  const k = key(cell.row, cell.col);
  if (highlight.value.peers.has(k)) classes.push('peer');
  if (highlight.value.sameValue.has(k) && cell.value !== 0) classes.push('same-value');
  if (conflicts.value.has(k)) classes.push('conflict');
  if (cell.evaluation === GameMoveEvaluation.Inconsistent) classes.push('inconsistent');
  // Thick borders on every 3rd boundary.
  if (cell.row % BOX_SIZE === 0) classes.push('box-top');
  if (cell.col % BOX_SIZE === 0) classes.push('box-left');
  if (cell.row === BOARD_SIZE - 1) classes.push('box-bottom');
  if (cell.col === BOARD_SIZE - 1) classes.push('box-right');
  return classes;
}

function onCellClick(row: number, col: number): void {
  if (props.disabled) return;
  emit('select', row, col);
}

function onKeyDown(e: KeyboardEvent): void {
  if (props.disabled) return;
  const action = parseKeyEvent(e);
  if (!action) return;
  e.preventDefault();
  if (action.kind === 'move') {
    const from = props.selected ?? ([0, 0] as [number, number]);
    const [newRow, newCol] = moveCursor(from, action.dir);
    emit('select', newRow, newCol);
  } else if (action.kind === 'digit') {
    emit('digit', action.value);
  } else if (action.kind === 'clear') {
    emit('clear');
  } else if (action.kind === 'pencil-toggle') {
    emit('pencil-toggle');
  }
}

// Focus the selected cell whenever the selection changes, and on initial
// mount/remount, so keyboard users can immediately navigate with arrow keys.
watch(
  () => props.selected,
  (sel) => {
    if (sel === null) return;
    const [r, c] = sel;
    void nextTick(() => {
      boardRoot.value
        ?.querySelector<HTMLElement>(`[data-testid="cell-${r}-${c}"]`)
        ?.focus();
    });
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="boardRoot"
    class="sudoku-board"
    role="grid"
    aria-label="Sudoku board"
    :aria-disabled="props.disabled || undefined"
    data-testid="sudoku-board"
    @keydown="onKeyDown"
  >
    <div
      v-for="(row, r) in props.grid"
      :key="r"
      class="board-row"
      role="row"
    >
      <button
        v-for="cell in row"
        :key="key(cell.row, cell.col)"
        type="button"
        role="gridcell"
        :aria-label="`Row ${cell.row + 1} column ${cell.col + 1}${
          cell.value !== 0 ? `, value ${cell.value}` : ', empty'
        }${cell.given ? ', given' : ''}`"
        :aria-selected="isSelected(cell)"
        :class="cellClasses(cell)"
        :data-row="cell.row"
        :data-col="cell.col"
        :data-given="cell.given || undefined"
        :data-value="cell.value || undefined"
        :data-conflict="conflicts.has(key(cell.row, cell.col)) || undefined"
        :data-testid="`cell-${cell.row}-${cell.col}`"
        :tabindex="cellTabIndex(cell)"
        :disabled="props.disabled"
        @click="onCellClick(cell.row, cell.col)"
      >
        <template v-if="cell.value !== 0">
          <span class="cell-value">{{ cell.value }}</span>
        </template>
        <template v-else-if="cell.notes.size > 0">
          <span class="cell-notes" aria-label="notes">
            <span
              v-for="n in 9"
              :key="n"
              class="cell-note"
              :class="{ visible: cell.notes.has(n) }"
              >{{ cell.notes.has(n) ? n : '' }}</span
            >
          </span>
        </template>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sudoku-board {
  display: inline-grid;
  grid-template-rows: repeat(9, minmax(0, 1fr));
  gap: 0;
  border: 2px solid #1f2937;
  background: #1f2937;
  user-select: none;
}
.board-row {
  display: grid;
  grid-template-columns: repeat(9, minmax(0, 1fr));
}
.board-cell {
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #d1d5db;
  font-size: 1.25rem;
  font-weight: 500;
  color: #1e3a8a;
  cursor: pointer;
  position: relative;
  padding: 0;
}
.board-cell.given {
  color: #111827;
  font-weight: 700;
  background: #f9fafb;
}
.board-cell.peer {
  background: #eff6ff;
}
.board-cell.same-value {
  background: #dbeafe;
}
.board-cell.selected {
  background: #93c5fd;
  outline: 2px solid #1d4ed8;
  outline-offset: -2px;
  z-index: 1;
}
.board-cell.conflict,
.board-cell.inconsistent {
  color: #b91c1c;
  background: #fee2e2;
}
.board-cell.box-top {
  border-top: 2px solid #1f2937;
}
.board-cell.box-left {
  border-left: 2px solid #1f2937;
}
.board-cell.box-bottom {
  border-bottom: 2px solid #1f2937;
}
.board-cell.box-right {
  border-right: 2px solid #1f2937;
}
.cell-value {
  font-variant-numeric: tabular-nums;
}
.cell-notes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  width: 100%;
  height: 100%;
  font-size: 0.625rem;
  color: #6b7280;
  font-weight: 500;
}
.cell-note {
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 640px) {
  .board-cell {
    width: 2.25rem;
    height: 2.25rem;
    font-size: 1rem;
  }
}
</style>
