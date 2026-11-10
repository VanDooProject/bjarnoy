import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';
import { waterDryMasksPlugin } from './build/waterDryMasks.ts';

export default defineConfig({
  plugins: [vue(), waterDryMasksPlugin()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test/atlasManifestsSetup.ts', './src/test/placementRulesSetup.ts'],
    include: ['src/**/*.test.ts', '../../scripts/worldgen-preview/*.test.ts'],
  },
});
