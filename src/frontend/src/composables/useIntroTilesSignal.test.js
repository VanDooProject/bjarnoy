import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { atlasPageCount } from '../lib/map/atlasManifests';
import { introLoad } from '../intro/introLoad';
import { introSignal } from '../intro/introSignal';
import { useIntroTilesSignal } from './useIntroTilesSignal';
function setup() {
    const settled = ref(false);
    const error = ref(null);
    const canvasShown = ref(true);
    const loadState = ref(undefined);
    const animLoad = ref(null);
    useIntroTilesSignal({ settled, error, canvasShown, loadState, animLoad });
    return { settled, error, canvasShown, loadState, animLoad };
}
describe('useIntroTilesSignal', () => {
    beforeEach(() => {
        introSignal.tilesLoaded = false;
        introLoad.terrain = null;
        introLoad.buildings = null;
        introLoad.animations = null;
    });
    it('waits for the load flow to settle', async () => {
        const s = setup();
        s.loadState.value = { phase: 'ready' };
        await nextTick();
        expect(introSignal.tilesLoaded).toBe(false);
        s.settled.value = true;
        await nextTick();
        expect(introSignal.tilesLoaded).toBe(true);
    });
    it('waits for the atlases while the canvas is shown', async () => {
        const s = setup();
        s.settled.value = true;
        s.loadState.value = { phase: 'buildings' };
        await nextTick();
        expect(introSignal.tilesLoaded).toBe(false);
        s.loadState.value = { phase: 'ready' };
        await nextTick();
        expect(introSignal.tilesLoaded).toBe(true);
    });
    it('signals when the load failed', async () => {
        const s = setup();
        s.settled.value = true;
        s.error.value = new Error('boom');
        await nextTick();
        expect(introSignal.tilesLoaded).toBe(true);
    });
    it('signals when no canvas will be shown', async () => {
        const s = setup();
        s.canvasShown.value = false;
        s.settled.value = true;
        await nextTick();
        expect(introSignal.tilesLoaded).toBe(true);
    });
    it('reports the full page totals up front, before any phase reports progress', () => {
        setup();
        expect(introLoad.terrain).toEqual({ loaded: 0, total: atlasPageCount('terrain') });
        expect(introLoad.buildings).toEqual({
            loaded: 0,
            total: atlasPageCount('buildings-level1') + atlasPageCount('buildings-static'),
        });
        expect(atlasPageCount('terrain')).toBeGreaterThan(0);
    });
    it('counts a phase that reported no pages as fully loaded once it moved on', async () => {
        const s = setup();
        const terrainTotal = atlasPageCount('terrain');
        s.loadState.value = { phase: 'terrain' };
        s.loadState.value = { phase: 'buildings' };
        await nextTick();
        expect(introLoad.terrain).toEqual({ loaded: terrainTotal, total: terrainTotal });
        s.loadState.value = { phase: 'ready' };
        await nextTick();
        const buildingsTotal = atlasPageCount('buildings-level1') + atlasPageCount('buildings-static');
        expect(introLoad.buildings).toEqual({ loaded: buildingsTotal, total: buildingsTotal });
    });
    it('reports terrain and building page counts, completing each group when its phase ends', async () => {
        const s = setup();
        const terrainTotal = atlasPageCount('terrain');
        const buildingsTotal = atlasPageCount('buildings-level1') + atlasPageCount('buildings-static');
        s.loadState.value = { phase: 'terrain', progress: 1 / terrainTotal, pages: { loaded: 1, total: terrainTotal } };
        await nextTick();
        expect(introLoad.terrain).toEqual({ loaded: 1, total: terrainTotal });
        expect(introLoad.buildings).toEqual({ loaded: 0, total: buildingsTotal });
        s.loadState.value = { phase: 'buildings' };
        await nextTick();
        expect(introLoad.terrain).toEqual({ loaded: terrainTotal, total: terrainTotal });
        s.loadState.value = { phase: 'buildings', progress: 1 / buildingsTotal, pages: { loaded: 1, total: buildingsTotal } };
        await nextTick();
        expect(introLoad.buildings).toEqual({ loaded: 1, total: buildingsTotal });
        s.loadState.value = { phase: 'ready' };
        await nextTick();
        expect(introLoad.buildings).toEqual({ loaded: buildingsTotal, total: buildingsTotal });
    });
    it('reports the animation page count', async () => {
        const s = setup();
        expect(introLoad.animations).toBeNull();
        s.animLoad.value = { loaded: 2, total: 5 };
        await nextTick();
        expect(introLoad.animations).toEqual({ loaded: 2, total: 5 });
    });
});
