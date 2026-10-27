<script setup lang="ts">
// W3: a build that was shown optimistically (the "…" dial on its hex) and then
// refused by the server. This small chip carries the server's message under
// the hex for a moment; the dial itself shakes and fades (HexMapRenderer's
// `rejectConstructionDial`). Pinned to the hex with useMapAnchor, the way
// GuidancePointer is, so it follows the camera while it is up.
import { ref } from 'vue';
import { useMapAnchor, type MapAnchorRenderer } from '../../composables/useMapAnchor';
import type { AxialCoord } from '../../lib/hex/coords';

const props = defineProps<{
  renderer: MapAnchorRenderer | null | undefined;
  coord: AxialCoord;
  message: string;
}>();

const el = ref<HTMLElement | null>(null);
useMapAnchor(el, () => props.renderer, () => props.coord);
</script>

<template>
  <div ref="el" class="refusal-chip" role="status" data-testid="build-refusal">
    <span class="refusal-chip-body">{{ message }}</span>
  </div>
</template>

<style scoped>
/* `--anchor-x/-y` are the hex centre (written by useMapAnchor); the chip sits
   just under it, kept clear of the screen edges. Above the ring (z 30). */
.refusal-chip {
  position: absolute;
  left: clamp(146px, var(--anchor-x, 50%), calc(100vw - 146px));
  top: calc(var(--anchor-y, 50%) + 26px);
  transform: translateX(-50%);
  z-index: 36;
  max-width: min(280px, calc(100vw - 32px));
  pointer-events: none;
}
.refusal-chip-body {
  display: block;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(10, 20, 27, 0.96);
  border: 1px solid rgba(226, 112, 95, 0.55);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.55);
  font-size: 11.5px;
  line-height: 1.35;
  color: #f0c3ba;
  animation: refusal-chip-in 220ms ease-out;
}
@keyframes refusal-chip-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .refusal-chip-body {
    animation: none;
  }
}
</style>
