// Test helper: the river flow inputs of a real vendored art frame (the gitignored bg_assets_hextile submodule).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBaseCanvases } from '../../../../build/waterDryMasks';
import { cellSourceRect, cropHalf } from './dryMaskCore';
import { riverMaskHalf } from './riverMaskCore';
import { topFacePolygonTexels, type RiverFlowInput } from './riverFlow';

/** Whether the vendored atlas is checked out (then the art-backed tests run, otherwise they are skipped). */
export const vendoredArt = existsSync(resolve(__dirname, '../../../../vendor/bg_assets_hextile/atlas/terrain-4.json'));

/** The flow input (without out edge) of the frame called `name`. */
export async function riverFrameInput(name: string): Promise<Omit<RiverFlowInput, 'outEdge'>> {
  const bases = await loadBaseCanvases();
  const frame = bases.get(name);
  if (!frame) throw new Error(`no vendored frame ${name}`);
  const rect = cellSourceRect(frame.trim);
  return {
    mask: cropHalf(riverMaskHalf(frame.canvas), rect),
    cw: rect.sw >> 1,
    ch: rect.sh >> 1,
    polygon: topFacePolygonTexels(rect.sx, rect.sy),
  };
}
