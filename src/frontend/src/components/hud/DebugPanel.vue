<script setup lang="ts">
// The collapsible shell every `?debug=1` panel sits in.
//
// The stack outgrew the viewport: four panels, and the water one alone carries
// eleven checkboxes and ten sliders. The column scrolls (see the views' own
// `.fog-debug-stack` rule), but scrolling past three panels to reach the fourth
// is not the same as being able to put the three away — and while you are
// tuning the water you are not reading the fog's flags.
//
// Collapsed state is per panel and kept in sessionStorage, the same scope and
// for the same reason as the debug flag that reveals these panels at all
// (useFogDebug): scoped to this tab, cleared on close, because this is a
// throwaway inspection aid and not a setting worth remembering across visits.
// It has to outlive a navigation, though — every internal nav remounts these
// components, and a panel that springs back open each time you change view is
// worse than one that never collapsed.
import { ref, watch } from 'vue';

const props = defineProps<{ title: string; storageKey: string }>();

const key = `fjordhold:debugPanel:${props.storageKey}`;
const collapsed = ref(sessionStorage.getItem(key) === '1');

watch(collapsed, (value) => {
  if (value) sessionStorage.setItem(key, '1');
  else sessionStorage.removeItem(key);
});
</script>

<template>
  <div class="panel debug-panel">
    <!-- A real button, not a div with a click handler: this is the only control
         on the panel that is not already a native input, and it should keep the
         keyboard and screen-reader behaviour the rest of them get for free. -->
    <button type="button" class="title" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
      <span class="chevron" :class="{ collapsed }" aria-hidden="true">▾</span>
      <span>{{ title }}</span>
    </button>
    <div v-show="!collapsed">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.debug-panel {
  padding: 12px 14px;
  min-width: 230px;
}
.title {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  /* Undo the button defaults rather than restyling around them, so this reads
     exactly like the plain heading it replaced. */
  appearance: none;
  background: none;
  border: none;
  padding: 0;
  margin-bottom: 8px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.title:hover {
  color: var(--text);
}
.chevron {
  display: inline-block;
  font-size: 10px;
  line-height: 1;
  transition: transform 120ms ease;
}
/* Pointing right when closed, down when open — the direction the body would
   appear in, which is the convention every disclosure widget uses. */
.chevron.collapsed {
  transform: rotate(-90deg);
}
</style>
