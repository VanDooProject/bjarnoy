import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { DEMO_MODE } from './config';
import { router } from './router';
import { useWorldStore } from './stores/world';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

app.mount('#app');

// Demo-mode-only debug hook: lets test/screenshot scripts (e.g.
// scripts/screenshot-helpers) drive WorldModel mutations — like placing a
// building type the current UI has no picker for yet (see BuildingModal.vue)
// — without a real backend or a full building-choice menu. Never present in
// a live (VITE_DEMO_MODE=false) build.
if (DEMO_MODE) {
  (window as unknown as { __demoWorld: () => ReturnType<typeof useWorldStore> }).__demoWorld = () =>
    useWorldStore();
}
