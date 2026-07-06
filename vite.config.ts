import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mini App «Отчёт» (Фаза 5). base — под GitHub Pages (репо hyposcore-miniapp).
export default defineConfig({
  base: '/hyposcore-miniapp/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
