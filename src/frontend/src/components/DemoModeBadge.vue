<script setup lang="ts">
import { DEMO_MODE } from '../config';
</script>

<template>
  <div v-if="DEMO_MODE" class="demo-badge" title="No backend is connected — progress lives only in this browser tab and is lost on reload.">
    Demo mode — progress isn't saved
  </div>
</template>

<style scoped>
.demo-badge {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 4px 14px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--shell);
  background: var(--gold);
  border-radius: 0 0 8px 8px;
  pointer-events: none;
}
</style>
