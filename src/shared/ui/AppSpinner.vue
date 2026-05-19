<script setup lang="ts">
interface Props {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

withDefaults(defineProps<Props>(), {
  size: 'md',
  label: 'Loading',
});

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-4',
};
</script>

<template>
  <span
    role="status"
    :aria-label="label"
    :class="[
      'inline-block animate-spin rounded-full border-blue-600 border-t-transparent dark:border-blue-400',
      sizeClasses[size],
    ]"
  ></span>
</template>
