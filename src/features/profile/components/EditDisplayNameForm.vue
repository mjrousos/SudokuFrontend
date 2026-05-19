<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { ApiError } from '@/shared/api/problemDetails';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';
import { useToastStore } from '@/shared/ui/toastStore';

import { useProfileStore } from '../store/profileStore';

const props = defineProps<{
  displayName: string;
}>();

const profileStore = useProfileStore();
const toasts = useToastStore();

const draftDisplayName = ref('');
const fieldError = ref('');
const formError = ref<string | null>(null);

watch(
  () => props.displayName,
  (value) => {
    draftDisplayName.value = value;
  },
  { immediate: true },
);

const canSubmit = computed(() => {
  const nextValue = draftDisplayName.value.trim();
  return nextValue.length > 0 && nextValue !== props.displayName.trim() && !profileStore.saving;
});

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

async function onSubmit(): Promise<void> {
  fieldError.value = '';
  formError.value = null;

  const nextValue = draftDisplayName.value.trim();
  if (!nextValue) {
    fieldError.value = 'Display name is required.';
    return;
  }

  try {
    await profileStore.updateDisplayName(nextValue);
    toasts.success('Display name updated.');
  } catch (err) {
    if (err instanceof ApiError) {
      fieldError.value =
        getFieldError(err, 'displayName') ??
        (err.status === 409 && err.title === 'display_name_in_use'
          ? 'That display name is already in use.'
          : '');

      if (!fieldError.value) {
        formError.value = err.detail ?? err.title;
      }
      return;
    }

    formError.value = 'Could not update your display name. Please try again.';
  }
}
</script>

<template>
  <form class="space-y-4" novalidate data-testid="edit-display-name-form" @submit.prevent="onSubmit">
    <AppInput
      v-model="draftDisplayName"
      label="Display name"
      required
      input-id="profile-display-name"
      :disabled="profileStore.saving"
      :error-message="fieldError || undefined"
    />

    <p
      v-if="formError"
      class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      role="alert"
      data-testid="display-name-form-error"
    >
      {{ formError }}
    </p>

    <div class="flex justify-end">
      <AppButton
        type="submit"
        :loading="profileStore.saving"
        :disabled="!canSubmit"
        data-testid="save-display-name"
      >
        Save display name
      </AppButton>
    </div>
  </form>
</template>
