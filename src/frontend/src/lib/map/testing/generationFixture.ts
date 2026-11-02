// Generation constants as the API sends them, for component/store tests that need a
// world's `generation` block: the production defaults (`DEFAULT_GENERATION`), shaped as
// the admin settings (no world radius, plus `minimumIslandTiles`) and as the public
// `WorldGenerationResponse` (with the world radius).
import type { WorldGenerationResponse, WorldGenerationSettings } from '../../../api/types';
import { DEFAULT_GENERATION } from '../worldGenerator';

export function generationResponse(): WorldGenerationResponse {
  return { ...DEFAULT_GENERATION };
}

export function generationSettings(): WorldGenerationSettings {
  const { worldRadius: _worldRadius, ...rest } = DEFAULT_GENERATION;
  return { ...rest, minimumIslandTiles: 6 };
}
