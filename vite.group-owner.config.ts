import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const groupOwnerOutDir = fileURLToPath(new URL('./dist-group-owner', import.meta.url));

/** Vercel serves `/` from index.html. The dev entry stays group-owner.html. */
function groupOwnerRootIndex(): Plugin {
  return {
    name: 'group-owner-root-index',
    apply: 'build',
    closeBundle() {
      const source = join(groupOwnerOutDir, 'group-owner.html');
      if (!existsSync(source)) {
        throw new Error('Group Owner build did not emit group-owner.html');
      }
      copyFileSync(source, join(groupOwnerOutDir, 'index.html'));
    },
  };
}

/** Separate build for a future independent Group Owner deployment. Not the NextPari production app. */
export default defineConfig({
  plugins: [react(), groupOwnerRootIndex()],
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
  publicDir: false,
  build: {
    outDir: groupOwnerOutDir,
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./group-owner.html', import.meta.url)),
    },
  },
});
