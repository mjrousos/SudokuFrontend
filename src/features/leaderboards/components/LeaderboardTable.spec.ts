import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import LeaderboardTable from './LeaderboardTable.vue';
import type { LeaderboardEntryDto } from '@/shared/api/types';
import { Difficulty } from '@/shared/api/types';

function makeEntry(overrides: Partial<LeaderboardEntryDto> = {}): LeaderboardEntryDto {
  return {
    entryId: 'entry-1',
    rank: 1,
    userId: 'user-1',
    displayName: 'Alice',
    puzzleId: 'puzzle-1',
    difficulty: Difficulty.Hard,
    elapsedMs: 65_000,
    completedAt: '2024-02-01T12:34:56Z',
    dailyDate: '2024-02-01',
    ...overrides,
  };
}

describe('LeaderboardTable', () => {
  it('renders one row per entry with the expected column values', () => {
    const entry = makeEntry();
    const wrapper = mount(LeaderboardTable, {
      props: {
        entries: [entry],
        loading: false,
        hasMore: false,
        locked: false,
        kind: 'difficulty',
      },
    });

    const rows = wrapper.findAll('[data-testid="leaderboard-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain(String(entry.rank));
    expect(rows[0]!.text()).toContain(entry.displayName);
    expect(rows[0]!.text()).toContain(entry.difficulty);
    expect(rows[0]!.text()).toContain('01:05');
    expect(rows[0]!.text()).toContain(new Date(entry.completedAt).toLocaleString());
  });

  it('shows the empty state when there are no entries', () => {
    const wrapper = mount(LeaderboardTable, {
      props: {
        entries: [],
        loading: false,
        hasMore: false,
        locked: false,
        kind: 'difficulty',
      },
    });

    expect(wrapper.text()).toContain('No entries yet.');
  });

  it('shows the locked state message', () => {
    const wrapper = mount(LeaderboardTable, {
      props: {
        entries: [],
        loading: false,
        hasMore: false,
        locked: true,
        kind: 'daily',
      },
    });

    expect(wrapper.text()).toContain('This leaderboard becomes available after UTC midnight.');
  });

  it('emits loadMore when the load more button is clicked', async () => {
    const wrapper = mount(LeaderboardTable, {
      props: {
        entries: [makeEntry()],
        loading: false,
        hasMore: true,
        locked: false,
        kind: 'difficulty',
      },
    });

    await wrapper.get('[data-testid="load-more"]').trigger('click');

    expect(wrapper.emitted('loadMore')).toHaveLength(1);
  });
});
