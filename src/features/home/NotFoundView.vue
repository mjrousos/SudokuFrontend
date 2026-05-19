<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="space-y-4 text-center">
    <h1 class="text-3xl font-bold">404</h1>
    <p class="text-slate-600 dark:text-slate-300">We couldn't find that page.</p>
    <RouterLink :to="{ name: 'home' }" class="text-blue-600 hover:underline">
      Go home
    </RouterLink>
  </section>
</template>
