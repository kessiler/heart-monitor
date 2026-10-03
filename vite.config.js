import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: process.env.BASE_PATH || './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'es2022',
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
