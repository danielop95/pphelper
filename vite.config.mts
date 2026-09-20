import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src/renderer-next',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/renderer-next/', import.meta.url)) } },
  build: { outDir: '../../dist/renderer-next', emptyOutDir: true },
});
