import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    // Pin preview to 5173 so we match the documented backend CORS origin
    // (Vite's default would otherwise be 4173 and silently break E2E).
    port: 5173,
    strictPort: true,
  },
});
