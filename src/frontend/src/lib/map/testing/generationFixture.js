import { DEFAULT_GENERATION } from '../worldGenerator';
export function generationResponse() {
    return { ...DEFAULT_GENERATION };
}
export function generationSettings() {
    const { worldRadius: _worldRadius, ...rest } = DEFAULT_GENERATION;
    return { ...rest, minimumIslandTiles: 6 };
}
