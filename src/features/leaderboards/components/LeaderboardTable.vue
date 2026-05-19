<script setup lang="ts">
import AppButton from '@/shared/ui/AppButton.vue';
import AppSpinner from '@/shared/ui/AppSpinner.vue';
import { formatElapsed } from '@/shared/composables/useTimer';
import type { LeaderboardEntryDto } from '@/shared/api/types';

interface Props {
  entries: LeaderboardEntryDto[];
  loading: boolean;
  hasMore: boolean;
  locked: boolean;
  kind: 'difficulty' | 'daily';
}

defineProps<Props>();
defineEmits<{
  loadMore: [];
}>();

function completedAtLabel(completedAt: string): string {
  return new Date(completedAt).toLocaleString();
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="locked" class="rounded-md bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
      This leaderboard becomes available after UTC midnight.
    </div>

    <div v-else-if="loading && entries.length === 0" class="flex justify-center py-8">
      <AppSpinner size="lg" />
    </div>

    <div v-else-if="entries.length === 0" data-testid="leaderboard-empty" class="rounded-md bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-200">
      No entries yet.
    </div>

    <template v-else>
      <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table class="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead class="bg-slate-50 dark:bg-slate-900/60">
            <tr>
              <th class="px-4 py-3 text-left font-semibold">Rank</th>
              <th class="px-4 py-3 text-left font-semibold">Player</th>
              <th class="px-4 py-3 text-left font-semibold">
                {{ kind === 'daily' ? 'Date' : 'Difficulty' }}
              </th>
              <th class="px-4 py-3 text-left font-semibold">Time</th>
              <th class="px-4 py-3 text-left font-semibold">Completed at</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
            <tr v-for="entry in entries" :key="entry.entryId" data-testid="leaderboard-row">
              <td class="px-4 py-3">{{ entry.rank }}</td>
              <td class="px-4 py-3">{{ entry.displayName }}</td>
              <td class="px-4 py-3">
                {{ kind === 'daily' ? (entry.dailyDate ?? '—') : entry.difficulty }}
              </td>
              <td class="px-4 py-3">{{ formatElapsed(entry.elapsedMs) }}</td>
              <td class="px-4 py-3">
                <time :datetime="entry.completedAt">{{ completedAtLabel(entry.completedAt) }}</time>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="hasMore || loading" class="flex justify-center">
        <AppButton
          v-if="hasMore && !loading"
          variant="secondary"
          data-testid="load-more"
          @click="$emit('loadMore')"
        >
          Load more
        </AppButton>
        <AppSpinner v-else size="md" />
      </div>
    </template>
  </div>
</template>
