import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { DEMO_MODE } from './config';
import { waterDebugFlags, waterDebugTuning } from './lib/map/water/waterDebug';
import { fogDebugFlags, fogDebugTuning, fogPerfStats } from './lib/map/HexMapRenderer';
import { router } from './router';
import { useWorldStore } from './stores/world';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.mount('#app');

// Demo-mode-only debug hooks: let test/screenshot scripts (e.g.
// scripts/screenshot-helpers) drive the app past what the real UI exposes
// yet. Never present in a live (VITE_DEMO_MODE=false) build.
if (DEMO_MODE) {
  // Drives WorldModel mutations directly — e.g. placing a building type the
  // current UI has no picker for (see BuildingModal.vue) — without a real
  // backend or a full building-choice menu.
  (window as unknown as { __demoWorld: () => ReturnType<typeof useWorldStore> }).__demoWorld = () =>
    useWorldStore();
  // Toggles individual fog-rendering mechanisms on/off (HexMapRenderer's
  // FogDebugFlags) so each can be inspected in isolation — see the flags'
  // own doc comments for what each one isolates. Mutate directly, e.g.
  // `window.__fogDebug.distJitter = false`; takes effect on the next
  // rebuild (any camera pan/zoom), it isn't itself a trigger.
  (window as unknown as { __fogDebug: typeof fogDebugFlags }).__fogDebug = fogDebugFlags;
  // Water shader's own debug flags/knobs — the console-side twin of
  // WaterDebugPanel (see waterDebug.ts), exposed on the same terms as
  // __fogDebug above.
  (window as unknown as { __waterDebug: typeof waterDebugFlags }).__waterDebug = waterDebugFlags;
  (window as unknown as { __waterTuning: typeof waterDebugTuning }).__waterTuning = waterDebugTuning;
  // The non-boolean half of the same knob set (currently just the wind-speed
  // multiplier) — see FogDebugTuning.
  (window as unknown as { __fogTuning: typeof fogDebugTuning }).__fogTuning = fogDebugTuning;
  // The read side of the same surface: the counters and phase timings
  // FogPerfPanel renders, exposed so a script can read them too — the panel
  // polls this object, so anything measuring a cull's effect (wave/terrain
  // drawn vs culled) can sample it directly instead of scraping the DOM.
  (window as unknown as { __fogPerf: typeof fogPerfStats }).__fogPerf = fogPerfStats;
}
