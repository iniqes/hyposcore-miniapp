import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mini App «Отчёт». base — под GitHub Pages (репо hyposcore-miniapp).
export default defineConfig({
  base: '/hyposcore-miniapp/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      // recharts (со свитой d3/victory/lodash) — отдельным чанком: skeleton виден
      // сразу, тяжёлый радар доезжает вторым запросом. Остальные vendor-модули
      // (react и мелочь) — в чанк react, чтобы rollup не утащил react внутрь recharts.
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          return /node_modules\/(recharts|react-smooth|recharts-scale|victory-vendor|d3-|lodash|decimal\.js-light|eventemitter3|fast-equals|tiny-invariant)/.test(
            id,
          )
            ? 'recharts'
            : 'react';
        },
      },
    },
  },
});
