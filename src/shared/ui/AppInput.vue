<script setup lang="ts">
import { computed, useId } from 'vue';

interface Props {
  modelValue?: string;
  label: string;
  type?: string;
  required?: boolean;
  autocomplete?: string;
  placeholder?: string;
  errorMessage?: string;
  helpText?: string;
  disabled?: boolean;
  inputId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  required: false,
  autocomplete: undefined,
  placeholder: undefined,
  errorMessage: undefined,
  helpText: undefined,
  disabled: false,
  inputId: undefined,
});

defineEmits<{
  'update:modelValue': [string];
  blur: [FocusEvent];
}>();

const autoId = useId();
const id = computed(() => props.inputId ?? `input-${autoId}`);
const descById = computed(() => {
  if (props.errorMessage) return `${id.value}-error`;
  if (props.helpText) return `${id.value}-help`;
  return undefined;
});
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="id" class="text-sm font-medium text-slate-700 dark:text-slate-200">
      {{ label }}
      <span v-if="required" aria-hidden="true" class="text-rose-500">*</span>
    </label>
    <input
      :id="id"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :required="required"
      :disabled="disabled"
      :autocomplete="autocomplete"
      :aria-invalid="!!errorMessage"
      :aria-describedby="descById"
      :class="[
        'w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm transition placeholder:text-slate-400 dark:bg-slate-900 dark:text-slate-100',
        errorMessage
          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500'
          : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600',
        'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800',
      ]"
      @input="(e) => $emit('update:modelValue', (e.target as HTMLInputElement).value)"
      @blur="(e) => $emit('blur', e)"
    />
    <p
      v-if="errorMessage"
      :id="descById"
      class="text-xs text-rose-600 dark:text-rose-400"
      role="alert"
    >
      {{ errorMessage }}
    </p>
    <p
      v-else-if="helpText"
      :id="descById"
      class="text-xs text-slate-500 dark:text-slate-400"
    >
      {{ helpText }}
    </p>
  </div>
</template>
