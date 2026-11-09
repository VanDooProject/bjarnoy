// Pins an HTML overlay element (GuidancePointer.vue, ResourceTicker.vue) to
// a hex's screen position as the map's camera pans/zooms. The camera moves
// every frame of a drag and HexMapRenderer has no camera-change callback —
// adding one would fire a Vue-reactive update on every such frame for a
// value nothing else needs. Instead this writes CSS custom properties
// directly onto the element from a requestAnimationFrame loop: one style
// write per frame, no component re-render, same "just read it every tick"
// convention the renderer's own onTick loop already uses internally.
import { onUnmounted } from 'vue';
/**
 * `getRenderer`/`getCoord` are read fresh every frame rather than captured
 * once: the renderer mounts asynchronously (LandingView's canvas), and the
 * coord can change (a new next-step target) without this composable being
 * re-set-up.
 */
export function useMapAnchor(el, getRenderer, getCoord) {
    let frame = requestAnimationFrame(tick);
    function tick() {
        frame = requestAnimationFrame(tick);
        const target = el.value;
        const renderer = getRenderer();
        const coord = getCoord();
        if (!target || !renderer || !coord)
            return;
        const { x, y } = renderer.hexCenterScreen(coord);
        target.style.setProperty('--anchor-x', `${x}px`);
        target.style.setProperty('--anchor-y', `${y}px`);
    }
    onUnmounted(() => cancelAnimationFrame(frame));
}
