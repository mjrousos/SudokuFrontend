<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '@/features/auth/store/authStore';
import { ApiError } from '@/shared/api/problemDetails';
import AppButton from '@/shared/ui/AppButton.vue';
import AppInput from '@/shared/ui/AppInput.vue';
import AppModal from '@/shared/ui/AppModal.vue';

import { useProfileStore } from '../store/profileStore';

const props = defineProps<{
  open: boolean;
  displayName: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const auth = useAuthStore();
const profileStore = useProfileStore();
const router = useRouter();

const confirmationText = ref('');
const formError = ref<string | null>(null);

const canDelete = computed(
  () =>
    confirmationText.value === props.displayName &&
    props.displayName.length > 0 &&
    !profileStore.deleting,
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      confirmationText.value = '';
      formError.value = null;
    }
  },
);

function close(): void {
  confirmationText.value = '';
  formError.value = null;
  emit('close');
}

async function confirmDelete(): Promise<void> {
  if (!canDelete.value) {
    return;
  }

  try {
    await profileStore.deleteAccount();
    await auth.logout();
    await router.push('/');
  } catch (err) {
    if (err instanceof ApiError) {
      formError.value = err.detail ?? err.title;
      return;
    }

    formError.value = 'Could not delete your account. Please try again.';
  }
}
</script>

<template>
  <AppModal
    :open="props.open"
    title="Delete account?"
    data-testid="delete-account-dialog"
    @close="close"
  >
    <div class="space-y-4">
      <p>
        This permanently deletes your account and stats. Type
        <strong>{{ props.displayName }}</strong>
        to confirm.
      </p>

      <AppInput
        v-model="confirmationText"
        :label="`Type ${props.displayName} to confirm`"
        input-id="delete-account-confirmation"
        :disabled="profileStore.deleting"
      />

      <p
        v-if="formError"
        class="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
        role="alert"
        data-testid="delete-account-error"
      >
        {{ formError }}
      </p>
    </div>

    <template #footer>
      <AppButton variant="secondary" data-testid="cancel-delete-account" @click="close">
        Cancel
      </AppButton>
      <AppButton
        variant="danger"
        :loading="profileStore.deleting"
        :disabled="!canDelete"
        data-testid="confirm-delete-account"
        @click="confirmDelete"
      >
        Delete account
      </AppButton>
    </template>
  </AppModal>
</template>
