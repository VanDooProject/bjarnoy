import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { StaticWorldModel } from '../lib/map/StaticWorldModel';
let passed;
const zoomStep = vi.fn();
vi.mock('./useHexMapRenderer', () => ({
    useHexMapRenderer: (_canvas, _container, options) => {
        passed = options;
        return { renderer: ref({ zoomStep }) };
    },
}));
import { useDocsMapRenderer } from './useDocsMapRenderer';
describe('useDocsMapRenderer', () => {
    const world = new StaticWorldModel();
    it('hands every docs map a fitted camera the reader can drag and zoom, and leaves the page scroll to the article', () => {
        useDocsMapRenderer(ref(null), ref(null), { worldModel: world, previewCenter: { q: 1, r: 2 } });
        expect(passed).toMatchObject({
            mode: 'settlement',
            worldModel: world,
            playerId: 'docs',
            previewCenter: { q: 1, r: 2 },
            confineCamera: true,
            allowPageScroll: true,
            hideSettlementBadge: true,
        });
        expect(passed.lockCamera).toBeFalsy();
    });
    it('keeps the map\'s own player and callbacks', () => {
        const onHoverChange = vi.fn();
        useDocsMapRenderer(ref(null), ref(null), { worldModel: world, previewCenter: { q: 0, r: 0 }, playerId: 'me', onHoverChange });
        expect(passed.playerId).toBe('me');
        expect(passed.onHoverChange).toBe(onHoverChange);
    });
    describe('zoom controls', () => {
        afterEach(() => vi.useRealTimers());
        it('shows the wheel hint when a wheel is left to the page and hides it after 1.5 s, restarting on repeated wheels', () => {
            vi.useFakeTimers();
            const { wheelHint } = useDocsMapRenderer(ref(null), ref(null), { worldModel: world, previewCenter: { q: 0, r: 0 } });
            expect(wheelHint.value).toBe(false);
            passed.onWheelToPage();
            expect(wheelHint.value).toBe(true);
            vi.advanceTimersByTime(1000);
            passed.onWheelToPage();
            vi.advanceTimersByTime(1000);
            expect(wheelHint.value).toBe(true);
            vi.advanceTimersByTime(500);
            expect(wheelHint.value).toBe(false);
        });
        it("steps the renderer's zoom in and out", () => {
            const { zoomIn, zoomOut } = useDocsMapRenderer(ref(null), ref(null), { worldModel: world, previewCenter: { q: 0, r: 0 } });
            zoomIn();
            expect(zoomStep).toHaveBeenLastCalledWith(1);
            zoomOut();
            expect(zoomStep).toHaveBeenLastCalledWith(-1);
        });
    });
});
