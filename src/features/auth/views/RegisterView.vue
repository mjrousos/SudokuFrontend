<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { z } from 'zod';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';
import { useToastStore } from '@/shared/ui/toastStore';

const auth = useAuthStore();
const router = useRouter();
const toasts = useToastStore();

const schema = z.object({
  displayName: z
    .string()
    .min(2, 'Display name must be at least 2 characters.')
    .max(32, 'Display name must be 32 characters or fewer.'),
  email: z.string().email('Enter a valid email.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[a-z]/, 'Include at least one lowercase letter.')
    .regex(/[A-Z]/, 'Include at least one uppercase letter.')
    .regex(/[0-9]/, 'Include at least one digit.')
    .regex(/[^A-Za-z0-9]/, 'Include at least one symbol.'),
});

const form = reactive({ displayName: '', email: '', password: '' });
const fieldErrors = reactive({ displayName: '', email: '', password: '' });
const formError = ref<string | null>(null);
const submitting = ref(false);
const confirmationRequired = ref(false);

function validate(): boolean {
  for (const k of Object.keys(fieldErrors) as (keyof typeof fieldErrors)[]) fieldErrors[k] = '';
  const result = schema.safeParse(form);
  if (result.success) return true;
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]) as keyof typeof fieldErrors;
    if (key in fieldErrors && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return false;
}

const canSubmit = computed(() => !submitting.value);

async function onSubmit() {
  formError.value = null;
  if (!validate()) return;
  submitting.value = true;
  try {
    const { requiresEmailConfirmation } = await auth.register({
      displayName: form.displayName,
      email: form.email,
      password: form.password,
    });
    if (requiresEmailConfirmation) {
      confirmationRequired.value = true;
      toasts.info('Check your email to confirm your account.');
      return;
    }
    // Backend doesn't return tokens from register — follow up with login.
    await auth.login({ email: form.email, password: form.password });
    toasts.success('Account created.');
    await router.push({ name: 'home' });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 409) formError.value = err.detail ?? 'That email or display name is taken.';
      else if (err.status === 400) formError.value = err.detail ?? 'Please check the form.';
      else formError.value = err.detail ?? err.title;
    } else {
      formError.value = 'Could not create account. Please try again.';
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-semibold">Create your account</h1>
    <div
      v-if="confirmationRequired"
      class="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      data-testid="confirm-email-prompt"
    >
      <p class="font-medium">Confirm your email</p>
      <p>We sent a confirmation link to <strong>{{ form.email }}</strong>. Open it to activate your account.</p>
    </div>
    <form v-else class="space-y-4" novalidate data-testid="register-form" @submit.prevent="onSubmit">
      <AppInput
        v-model="form.displayName"
        label="Display name"
        required
        autocomplete="nickname"
        :error-message="fieldErrors.displayName || undefined"
        @blur="validate()"
      />
      <AppInput
        v-model="form.email"
        label="Email"
        type="email"
        autocomplete="email"
        required
        :error-message="fieldErrors.email || undefined"
        @blur="validate()"
      />
      <AppInput
        v-model="form.password"
        label="Password"
        type="password"
        autocomplete="new-password"
        required
        help-text="At least 8 characters with upper, lower, digit, and symbol."
        :error-message="fieldErrors.password || undefined"
        @blur="validate()"
      />
      <p
        v-if="formError"
        class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
        role="alert"
        data-testid="register-error"
      >
        {{ formError }}
      </p>
      <AppButton type="submit" :loading="submitting" :disabled="!canSubmit" class="w-full">
        Create account
      </AppButton>
    </form>
    <p class="text-center text-sm">
      Already have an account?
      <RouterLink :to="{ name: 'login' }" class="text-blue-600 hover:underline">Sign in</RouterLink>
    </p>
  </section>
</template>
