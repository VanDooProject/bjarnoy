// Vite plugin: preloads the app chunk (`main-*.js`) and the chunks it imports straight from index.html.
// boot.ts, the entry, paints the landing intro first and loads the app with `import('./main')`. Without these
// links the browser only learns about the app chunk once boot.ts has downloaded and run, one extra round trip
// before the map can start loading.
import type { Plugin } from 'vite';

export function preloadAppChunkPlugin(): Plugin {
  return {
    name: 'bjarnoy-preload-app-chunk',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return [];
        const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
        const app = chunks.find((chunk) => chunk.isDynamicEntry && chunk.facadeModuleId?.endsWith('/src/main.ts'));
        if (!app) throw new Error('preload-app-chunk: no dynamic chunk for src/main.ts');
        const entryImports = new Set(chunks.filter((chunk) => chunk.isEntry).flatMap((chunk) => [chunk.fileName, ...chunk.imports]));
        const files = new Set<string>();
        const visit = (fileName: string) => {
          if (files.has(fileName) || entryImports.has(fileName)) return;
          files.add(fileName);
          const chunk = bundle[fileName];
          if (chunk?.type === 'chunk') chunk.imports.forEach(visit);
        };
        visit(app.fileName);
        return [...files].map((fileName) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `/${fileName}` },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}
