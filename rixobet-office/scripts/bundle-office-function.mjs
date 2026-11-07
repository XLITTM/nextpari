import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  resolve: {
    alias: {
      'pg-native': join(root, 'scripts/pg-native-stub.js'),
    },
  },
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: 'server/functionEntry.ts',
    outDir: 'api/rixobet/office',
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    target: 'node22',
    copyPublicDir: false,
    rollupOptions: {
      output: {
        format: 'es',
        entryFileNames: 'bundle.js',
        inlineDynamicImports: true,
      },
    },
  },
});
