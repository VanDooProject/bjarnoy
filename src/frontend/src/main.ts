import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { usePlayerStore } from './stores/player';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);

usePlayerStore().persistId();

app.mount('#app');
