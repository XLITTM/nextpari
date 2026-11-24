import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const outDir = fileURLToPath(new URL('./dist-provider-office', import.meta.url));

function rootIndex(): Plugin {
  return {
    name: 'provider-office-root-index',
    apply: 'build',
    closeBundle() {
      const source = join(outDir, 'provider-office.html');
      if (!existsSync(source)) throw new Error('Provider Office build did not emit provider-office.html');
      copyFileSync(source, join(outDir, 'index.html'));
    },
  };
}

/** Separate build for partners.nextpari.net. Not the NextPari player app. */
export default defineConfig({
  plugins: [react(), rootIndex()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4175,
  },
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./provider-office.html', import.meta.url)),
    },
  },
});
