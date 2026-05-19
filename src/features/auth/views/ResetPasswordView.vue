<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { z } from 'zod';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';
import { useToastStore } from '@/shared/ui/toastStore';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const toasts = useToastStore();

const schema = z.object({
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[a-z]/, 'Include at least one lowercase letter.')
    .regex(/[A-Z]/, 'Include at least one uppercase letter.')
    .regex(/[0-9]/, 'Include at least one digit.')
    .regex(/[^A-Za-z0-9]/, 'Include at least one symbol.'),
});

const form = reactive({ newPassword: '' });
const fieldError = ref<string | null>(null);
const formError = ref<string | null>(null);
const submitting = ref(false);

const email = (route.query.email as string | undefined) ?? '';
const token = (route.query.token as string | undefined) ?? '';

async function onSubmit() {
  fieldError.value = null;
  formError.value = null;
  const r = schema.safeParse(form);
  if (!r.success) {
    fieldError.value = r.error.issues[0]?.message ?? 'Invalid password.';
    return;
  }
  if (!email || !token) {
    formError.value = 'This reset link is incomplete. Request a new one.';
    return;
  }
  submitting.value = true;
  try {
    await auth.confirmPasswordReset({ email, token, newPassword: form.newPassword });
    toasts.success('Password reset. You can sign in with your new password.');
    await router.push({ name: 'login' });
  } catch (err) {
    formError.value = err instanceof ApiError ? (err.detail ?? err.title) : 'Could not reset password.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-semibold">Choose a new password</h1>
    <form class="space-y-4" novalidate @submit.prevent="onSubmit">
      <AppInput
        v-model="form.newPassword"
        label="New password"
        type="password"
        autocomplete="new-password"
        required
        :error-message="fieldError || undefined"
      />
      <p
        v-if="formError"
        role="alert"
        class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      >
        {{ formError }}
      </p>
      <AppButton type="submit" :loading="submitting" class="w-full">Reset password</AppButton>
    </form>
  </section>
</template>
