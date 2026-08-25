<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <div class="impressum">
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
    </header>
    <main class="body">
      <h1>Impressum</h1>
      <p>
        Fjørdhold is a hobby project built for the VanDooProject community. This placeholder page exists
        so the real landing page has somewhere to link to — replace it with your actual legal notice
        (operator, contact address, and any disclosures your jurisdiction requires) before going live.
      </p>
      <button class="back" @click="router.push('/')">← Back</button>
    </main>
  </div>
</template>

<style scoped>
.impressum {
  width: 100vw;
  height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.topbar {
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.body {
  max-width: 60ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.body p {
  color: var(--muted);
  line-height: 1.6;
}
.back {
  margin-top: 12px;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.back:hover {
  border-color: var(--gold);
  color: var(--gold);
}
</style>
