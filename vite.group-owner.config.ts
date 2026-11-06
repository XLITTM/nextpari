import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** Separate build for a future independent Group Owner deployment. Not the NextPari production app. */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
  },
  build: {
    outDir: 'dist-group-owner',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./group-owner.html', import.meta.url)),
    },
  },
});
