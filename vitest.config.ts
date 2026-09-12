import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@mrvltechnologies/journey-provenance': path.resolve(dirname, 'packages/journey-provenance/src/index.ts'),
    },
  },
});
