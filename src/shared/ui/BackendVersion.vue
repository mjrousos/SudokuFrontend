<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';

import { useMetaStore } from '@/features/meta/store/metaStore';

// Renders the backend build version as unobtrusive footer chrome. The fetch is
// fire-and-forget; the store swallows failures, so while loading or on error
// nothing is rendered and the surrounding footer text stands on its own.
const meta = useMetaStore();
const { backendVersion } = storeToRefs(meta);

onMounted(() => {
  void meta.loadBackendVersion();
});
</script>

<template>
  <span v-if="backendVersion" data-testid="backend-version">
    &middot; API v{{ backendVersion }}
  </span>
</template>
