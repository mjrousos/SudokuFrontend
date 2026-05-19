<script setup lang="ts">
import { computed, reactive, ref } from 'vue';

import { ApiError } from '@/shared/api/problemDetails';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';
import { useToastStore } from '@/shared/ui/toastStore';

import { useProfileStore } from '../store/profileStore';

const profileStore = useProfileStore();
const toasts = useToastStore();

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const fieldErrors = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const formError = ref<string | null>(null);

const canSubmit = computed(
  () =>
    form.currentPassword.length > 0 &&
    form.newPassword.length > 0 &&
    form.confirmPassword.length > 0 &&
    !profileStore.changingPassword,
);

function getFieldError(err: ApiError, fieldName: string): string | undefined {
  const direct = err.fieldErrors?.[fieldName];
  if (direct && direct.length > 0) {
    return direct[0];
  }

  for (const [key, messages] of Object.entries(err.fieldErrors ?? {})) {
    if (key.toLowerCase() === fieldName.toLowerCase()) {
      return messages[0];
    }
  }

  return undefined;
}

function clearErrors(): void {
  fieldErrors.currentPassword = '';
  fieldErrors.newPassword = '';
  fieldErrors.confirmPassword = '';
  formError.value = null;
}

function validate(): boolean {
  clearErrors();

  if (!form.currentPassword) {
    fieldErrors.currentPassword = 'Current password is required.';
  }

  if (form.newPassword.length < 8) {
    fieldErrors.newPassword = 'New password must be at least 8 characters.';
  } else if (form.newPassword === form.currentPassword) {
    fieldErrors.newPassword = 'New password must be different from the current password.';
  }

  if (form.confirmPassword !== form.newPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.';
  }

  return !fieldErrors.currentPassword && !fieldErrors.newPassword && !fieldErrors.confirmPassword;
}

function resetForm(): void {
  form.currentPassword = '';
  form.newPassword = '';
  form.confirmPassword = '';
  clearErrors();
}

async function onSubmit(): Promise<void> {
  if (!validate()) {
    return;
  }

  try {
    await profileStore.changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    resetForm();
    toasts.success('Password updated.');
  } catch (err) {
    if (err instanceof ApiError) {
      fieldErrors.currentPassword =
        getFieldError(err, 'currentPassword') ??
        (err.status === 401 ? 'Current password is incorrect.' : '');
      fieldErrors.newPassword = getFieldError(err, 'newPassword') ?? fieldErrors.newPassword;

      if (!fieldErrors.currentPassword && !fieldErrors.newPassword) {
        formError.value = err.detail ?? err.title;
      }
      return;
    }

    formError.value = 'Could not change your password. Please try again.';
  }
}
</script>

<template>
  <form class="space-y-4" novalidate data-testid="change-password-form" @submit.prevent="onSubmit">
    <AppInput
      v-model="form.currentPassword"
      label="Current password"
      type="password"
      autocomplete="current-password"
      required
      input-id="profile-current-password"
      :disabled="profileStore.changingPassword"
      :error-message="fieldErrors.currentPassword || undefined"
    />
    <AppInput
      v-model="form.newPassword"
      label="New password"
      type="password"
      autocomplete="new-password"
      required
      input-id="profile-new-password"
      :disabled="profileStore.changingPassword"
      :error-message="fieldErrors.newPassword || undefined"
      help-text="Use at least 8 characters."
    />
    <AppInput
      v-model="form.confirmPassword"
      label="Confirm new password"
      type="password"
      autocomplete="new-password"
      required
      input-id="profile-confirm-password"
      :disabled="profileStore.changingPassword"
      :error-message="fieldErrors.confirmPassword || undefined"
    />

    <p
      v-if="formError"
      class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      role="alert"
      data-testid="change-password-error"
    >
      {{ formError }}
    </p>

    <div class="flex justify-end">
      <AppButton
        type="submit"
        :loading="profileStore.changingPassword"
        :disabled="!canSubmit"
        data-testid="change-password-submit"
      >
        Change password
      </AppButton>
    </div>
  </form>
</template>
