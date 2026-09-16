import { defineConfig } from 'vitest/config';

export default defineConfig({
  watch: false, // This disables file watching in all cases.
  test: {
    environment: 'jsdom',
    globals: true,
    watch: false  // This is the correct place for newer versions of Vitest
  }
});

