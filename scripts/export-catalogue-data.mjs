#!/usr/bin/env node
// Snapshots read-only backend catalogue data into the frontend as static
// JSON, so pages that only need reference data (not a live game session)
// can render it without a backend — this is what powers demo mode's
// building tech-tree page. Requires the backend to already be running
// locally (same precondition as the openapi-typescript codegen step
// documented in docs/tech/backend.md); it does not start one.
//
// Run manually whenever backend catalogue data changes:
//   node scripts/export-catalogue-data.mjs [baseUrl]
//
// Add more entries to EXPORTS below as more catalogue-shaped endpoints
// grow their own frontend-fallback needs — they all fetch and write in one
// pass here rather than needing a new script each time.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.argv[2] ?? 'http://localhost:5180';

const EXPORTS = [
  {
    name: 'building catalogue',
    path: '/api/v1/buildings',
    outFile: join(repoRoot, 'src/frontend/src/data/building-catalogue.json'),
  },
];

async function exportOne({ name, path, outFile }) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${name}: GET ${url} failed with ${res.status} ${res.statusText}`);
  }
  const data = await res.json();

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(
    outFile,
    JSON.stringify({ _meta: { source: url, generatedAt: new Date().toISOString() }, data }, null, 2) + '\n',
  );
  console.log(`${name}: wrote ${data.length} entries to ${outFile}`);
}

async function main() {
  try {
    await Promise.all(EXPORTS.map(exportOne));
  } catch (err) {
    console.error(err.message);
    console.error(`\nIs the backend running at ${baseUrl}? Start it (e.g. \`dotnet run --project src/backend/src/Bjarnoy.AppHost\`) and retry.`);
    process.exitCode = 1;
  }
}

main();
