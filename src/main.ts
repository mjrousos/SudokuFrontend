import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import { router } from './router';
import { useTheme } from '@/shared/composables/useTheme';
import './styles/tailwind.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Initialize the theme composable eagerly so the OS-preference listener
// is installed for the lifetime of the app, regardless of whether the
// user's first view ever mounts <ThemeToggle>. The pre-mount script in
// public/theme-init.js handled the initial paint; this keeps things in
// sync from now on.
useTheme();

// Best-effort silent hydration before mount so guards see the resolved
// auth state. The router.isReady() promise (set in router/index.ts) waits
// for the same hydration result.
app.mount('#app');
