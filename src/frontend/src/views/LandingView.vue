<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="landing">
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
    </header>

    <main class="hero">
      <h1>Raise a realm from the sea.</h1>
      <p class="lede">
        Fjørdhold is a browser-based Viking settlement game. Sail into a living world map, drop your
        longhouse on an island, and grow it hex by hex — no account, no sign-up wall, no waiting.
      </p>
      <button class="cta" @click="router.push('/world')">Enter the world</button>
      <p class="fine">
        Your first move is a real one: found a settlement straight away. A name for your realm — and an
        account, if you ever want one — comes later, once you have something worth naming.
      </p>
    </main>

    <footer class="foot">
      <span>&copy; {{ new Date().getFullYear() }} Fjørdhold</span>
      <router-link to="/impressum">Impressum</router-link>
    </footer>
  </div>
</template>

<style scoped>
.landing {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(120% 100% at 50% 0%, #16414f 0%, #0d2530 55%, #0b1116 100%);
  overflow: auto;
}
.topbar {
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  letter-spacing: -0.01em;
  color: var(--text);
}
.hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 18px;
  padding: 24px;
}
.hero h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 56px);
  color: var(--text);
  max-width: 18ch;
}
.lede {
  margin: 0;
  max-width: 52ch;
  font-size: 17px;
  line-height: 1.5;
  color: var(--muted);
}
.cta {
  margin-top: 6px;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  background: var(--gold);
  color: #20160a;
  border: none;
  border-radius: 999px;
  cursor: pointer;
}
.cta:hover {
  filter: brightness(1.08);
}
.fine {
  margin: 4px 0 0;
  max-width: 44ch;
  font-size: 13px;
  color: var(--muted-2);
}
.foot {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding: 18px;
  font-size: 13px;
  color: var(--muted-2);
}
.foot a {
  color: var(--muted-2);
}
.foot a:hover {
  color: var(--gold);
}
</style>
