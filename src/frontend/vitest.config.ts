import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/atlasManifestsSetup.ts'],
    include: ['src/**/*.test.ts', '../../scripts/worldgen-preview/*.test.ts'],
  },
});
