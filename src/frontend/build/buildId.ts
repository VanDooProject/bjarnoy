// Vite plugin: emits `build-id.txt`, the file name of the entry chunk (e.g. `assets/index-BhkDhqzG.js`).
// The name is content-hashed, so the id only changes when the frontend does. The API reads the file at
// startup and sends it as `X-App-Build`; the app knows its own id from its entry module's URL (appUpdate.ts).
import type { Plugin } from 'vite';

export function buildIdPlugin(): Plugin {
  return {
    name: 'bjarnoy-build-id',
    apply: 'build',
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find((file) => file.type === 'chunk' && file.isEntry);
      if (!entry) this.error('build-id: the bundle has no entry chunk');
      this.emitFile({ type: 'asset', fileName: 'build-id.txt', source: entry.fileName });
    },
  };
}
