// World preview: renders a world's terrain from the REAL client generator to a PNG.
//
//   cd src/frontend && npm run worldgen-preview -- --seed 11 --radius 1000 --out preview.png
//
// See scripts/worldgen-preview/README.md for every option.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_GENERATION, type WorldGenerationConstants } from '../../src/frontend/src/lib/map/worldGenerator';
import { LAYERS } from './layers';
import { renderPreview, type PreviewOptions } from './render';

const USAGE = `worldgen-preview - render a world from the real client generator

  --seed N            world seed (default 1)
  --radius N          world radius in hexes (default ${DEFAULT_GENERATION.worldRadius})
  --window Q,R,SIZE   only draw SIZE hexes across, centred on axial hex (Q,R) (default: the whole world)
  --px N              pixels per hex circumradius (default: fit the map to ~1800 px wide)
  --layers a,b        layers to draw, in order (default terrain); available: ${Object.keys(LAYERS).join(', ')}
  --set k=v,k=v       override generation constants, e.g. islandChance=0.5,islandCellSize=200
  --out FILE          PNG to write (default worldgen-preview.png; relative to where you ran npm)
  --no-legend         leave out the legend strip
  --no-stats          skip the landmass scan (islands / size distribution): much faster at large radii
  --help              this text
`;

function fail(message: string): never {
  console.error(`worldgen-preview: ${message}\n\n${USAGE}`);
  process.exit(1);
}

function number(name: string, value: string | undefined): number {
  const n = Number(value);
  if (value === undefined || value === '' || !Number.isFinite(n)) fail(`${name} needs a number, got "${value}"`);
  return n;
}

export function parseArgs(argv: string[]): { options: PreviewOptions; out: string } {
  const options: PreviewOptions = { seed: 1, radius: DEFAULT_GENERATION.worldRadius, layers: ['terrain'], legend: true, stats: true };
  let out = 'worldgen-preview.png';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--seed':
        options.seed = Math.trunc(number(arg, next()));
        break;
      case '--radius':
        options.radius = Math.trunc(number(arg, next()));
        if (options.radius < 1) fail('--radius must be at least 1');
        break;
      case '--window': {
        const parts = (next() ?? '').split(',');
        if (parts.length !== 3) fail('--window needs Q,R,SIZE');
        options.window = { q: number('window q', parts[0]), r: number('window r', parts[1]), size: number('window size', parts[2]) };
        if (options.window.size < 1) fail('--window size must be at least 1');
        break;
      }
      case '--px':
        options.hexPixels = number(arg, next());
        break;
      case '--layers':
        options.layers = (next() ?? '').split(',').filter(Boolean);
        for (const id of options.layers) if (!LAYERS[id]) fail(`unknown layer "${id}" (available: ${Object.keys(LAYERS).join(', ')})`);
        if (options.layers.length === 0) fail('--layers needs at least one layer');
        break;
      case '--set': {
        const overrides: Record<string, number> = {};
        for (const pair of (next() ?? '').split(',').filter(Boolean)) {
          const [key, value] = pair.split('=');
          if (!(key in DEFAULT_GENERATION) || key === 'worldRadius') fail(`--set: "${key}" is not a generation constant (use --radius for the radius)`);
          overrides[key] = number(`--set ${key}`, value);
        }
        options.generation = overrides as Partial<WorldGenerationConstants>;
        break;
      }
      case '--out':
        out = next() ?? fail('--out needs a file');
        break;
      case '--no-legend':
        options.legend = false;
        break;
      case '--no-stats':
        options.stats = false;
        break;
      case '--help':
      case '-h':
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        fail(`unknown option "${arg}"`);
    }
  }
  return { options, out };
}

function main(): void {
  const { options, out } = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const result = renderPreview(options);
  // `npm run` changes the working directory to the package root; INIT_CWD is where the user was.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), out);
  writeFileSync(file, result.png);
  console.log(result.statsLines.join('\n'));
  console.log(`wrote ${file} (${result.width}x${result.height}, ${((performance.now() - started) / 1000).toFixed(1)} s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();
