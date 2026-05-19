import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import { router } from './router';
import './styles/tailwind.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

// Best-effort silent hydration before mount so guards see the resolved
// auth state. The router.isReady() promise (set in router/index.ts) waits
// for the same hydration result.
app.mount('#app');
