<script setup lang="ts">
import { reactive, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { z } from 'zod';

import { useAuthStore } from '@/features/auth/store/authStore';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';

const auth = useAuthStore();
const schema = z.object({ email: z.string().email('Enter a valid email.') });
const form = reactive({ email: '' });
const fieldError = ref<string | null>(null);
const submitted = ref(false);
const submitting = ref(false);

async function onSubmit() {
  fieldError.value = null;
  const r = schema.safeParse(form);
  if (!r.success) {
    fieldError.value = r.error.issues[0]?.message ?? 'Invalid email.';
    return;
  }
  submitting.value = true;
  try {
    await auth.requestPasswordReset(form.email);
  } finally {
    submitting.value = false;
    submitted.value = true;
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-semibold">Reset your password</h1>
    <p v-if="submitted" class="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
      If an account with that email exists, we have sent a reset link.
    </p>
    <form v-else class="space-y-4" novalidate @submit.prevent="onSubmit">
      <AppInput
        v-model="form.email"
        label="Email"
        type="email"
        autocomplete="email"
        required
        :error-message="fieldError || undefined"
      />
      <AppButton type="submit" :loading="submitting" class="w-full">Send reset link</AppButton>
    </form>
    <p class="text-center text-sm">
      <RouterLink :to="{ name: 'login' }" class="text-blue-600 hover:underline">Back to sign in</RouterLink>
    </p>
  </section>
</template>
