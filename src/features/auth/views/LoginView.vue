<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { z } from 'zod';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import { safeRedirect } from '@/shared/auth/safeRedirect';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';
import { useToastStore } from '@/shared/ui/toastStore';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const toasts = useToastStore();

const schema = z.object({
  email: z.string().email('Enter a valid email.'),
  password: z.string().min(1, 'Password is required.'),
});

const form = reactive({ email: '', password: '' });
const fieldErrors = reactive({ email: '', password: '' });
const formError = ref<string | null>(null);
const submitting = ref(false);

function validate(): boolean {
  fieldErrors.email = '';
  fieldErrors.password = '';
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

const canSubmit = computed(() => !submitting.value && form.email.length > 0 && form.password.length > 0);

async function onSubmit() {
  formError.value = null;
  if (!validate()) return;
  submitting.value = true;
  try {
    await auth.login({ email: form.email, password: form.password });
    toasts.success('Signed in.');
    const redirectTo = safeRedirect(route.query.redirectTo);
    await router.push(redirectTo);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) formError.value = 'Invalid email or password.';
      else if (err.status === 423) formError.value = 'Your account is locked. Try again in a few minutes.';
      else if (err.status === 403) formError.value = 'Please confirm your email before signing in.';
      else formError.value = err.detail ?? err.title;
    } else {
      formError.value = 'Could not sign in. Please try again.';
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <h1 class="text-2xl font-semibold">Sign in</h1>
    <form class="space-y-4" novalidate data-testid="login-form" @submit.prevent="onSubmit">
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
        autocomplete="current-password"
        required
        :error-message="fieldErrors.password || undefined"
        @blur="validate()"
      />
      <p
        v-if="formError"
        class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
        role="alert"
        data-testid="login-error"
      >
        {{ formError }}
      </p>
      <AppButton type="submit" :loading="submitting" :disabled="!canSubmit" class="w-full">
        Sign in
      </AppButton>
    </form>
    <div class="flex justify-between text-sm">
      <RouterLink :to="{ name: 'forgot-password' }" class="text-blue-600 hover:underline">
        Forgot password?
      </RouterLink>
      <RouterLink :to="{ name: 'register' }" class="text-blue-600 hover:underline">
        Create account
      </RouterLink>
    </div>
  </section>
</template>
