<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import AppSpinner from '@/shared/ui/AppSpinner.vue';

const auth = useAuthStore();
const route = useRoute();
const status = ref<'pending' | 'ok' | 'fail'>('pending');
const message = ref<string>('');

onMounted(async () => {
  const userId = route.query.userId as string | undefined;
  const token = route.query.token as string | undefined;
  if (!userId || !token) {
    status.value = 'fail';
    message.value = 'This confirmation link is incomplete.';
    return;
  }
  try {
    await auth.confirmEmail(userId, token);
    status.value = 'ok';
  } catch (err) {
    status.value = 'fail';
    message.value = err instanceof ApiError ? (err.detail ?? err.title) : 'Could not confirm email.';
  }
});
</script>

<template>
  <section class="space-y-6 text-center">
    <h1 class="text-2xl font-semibold">Confirm your email</h1>
    <template v-if="status === 'pending'">
      <AppSpinner size="lg" />
    </template>
    <template v-else-if="status === 'ok'">
      <p class="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
        Your email is confirmed. You can sign in now.
      </p>
      <RouterLink :to="{ name: 'login' }" class="text-blue-600 hover:underline">Sign in</RouterLink>
    </template>
    <template v-else>
      <p class="rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
        {{ message }}
      </p>
      <RouterLink :to="{ name: 'home' }" class="text-blue-600 hover:underline">Back home</RouterLink>
    </template>
  </section>
</template>
