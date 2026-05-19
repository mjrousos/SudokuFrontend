<script setup lang="ts">
import { onMounted } from 'vue';
import { RouterView } from 'vue-router';

import AppToasts from '@/shared/ui/AppToasts.vue';
import { useAuthStore } from '@/features/auth/store/authStore';

const auth = useAuthStore();

onMounted(() => {
  // Fire-and-forget; the router guard handles the actual gating once this
  // promise resolves. We do this on mount instead of pre-mount because
  // Pinia must be installed first.
  void auth.hydrate();
});
</script>

<template>
  <RouterView />
  <AppToasts />
</template>
