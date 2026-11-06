import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? './' : '/',
  publicDir: false,
  build: { outDir: 'public/build', emptyOutDir: true },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8081',
      '/images': 'http://127.0.0.1:8081',
      '/uploads': 'http://127.0.0.1:8081',
    },
  },
}));
