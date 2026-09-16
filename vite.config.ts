import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PiSdkJs',
      fileName: () => `index.js`, // Standard ESM export filename
      formats: ['es']
    },
    sourcemap: true,
    outDir: 'dist'
  },
  plugins: [dts({
    entryRoot: 'src',
    outDir: 'dist',
    include: ['./src'],
  })]
});
