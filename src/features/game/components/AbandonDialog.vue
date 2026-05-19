<script setup lang="ts">
import AppButton from '@/shared/ui/AppButton.vue';
import AppModal from '@/shared/ui/AppModal.vue';

interface Props {
  open: boolean;
  pending?: boolean;
}
const props = withDefaults(defineProps<Props>(), { pending: false });
const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <AppModal
    :open="props.open"
    title="Abandon this game?"
    data-testid="abandon-dialog"
    @close="emit('cancel')"
  >
    <p>
      Abandoning marks this game as a loss. It will still appear in your stats but won’t
      count toward leaderboards.
    </p>
    <template #footer>
      <AppButton variant="secondary" data-testid="btn-cancel-abandon" @click="emit('cancel')">
        Keep playing
      </AppButton>
      <AppButton
        variant="danger"
        data-testid="btn-confirm-abandon"
        :loading="props.pending"
        @click="emit('confirm')"
      >
        Abandon
      </AppButton>
    </template>
  </AppModal>
</template>
