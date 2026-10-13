import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Le frontend appelle /malto/* → proxifié vers le backend Malto (évite le CORS).
      '/malto': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/malto/, ''),
      },
    },
  },
});
