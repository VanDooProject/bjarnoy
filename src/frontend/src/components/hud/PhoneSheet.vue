<script setup lang="ts">
// A bottom sheet for phones: slides up over the map, up to 60% of its height, with a grip on top and a scrolling body. It is
// a phone layer (composables/usePhoneLayer.ts) while open, so the HUD steps aside for it. A tap on the grip, a drag down
// past 30% of the sheet or a quick flick down, and Escape close it. It slides through lib/motion.ts's animate(), so the
// player's HUD motion setting turns the slide into an instant open and close.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { usePhoneLayer, vPhoneHidden } from '../../composables/usePhoneLayer';
import { animate } from '../../lib/motion';

defineOptions({ inheritAttrs: false });
const props = defineProps<{
  /** The sheet's accessible name. */
  label: string;
  /** Names the layer in the phone layer stack. */
  layerId?: string;
}>();
const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const layer = usePhoneLayer(open, props.layerId);

const SLIDE_MS = 220;
const SLIDE_EASING = 'cubic-bezier(0.2, 0, 0, 1)';
/** Closes when dragged down by this fraction of the sheet's height... */
const CLOSE_FRACTION = 0.3;
/** ...or released faster than this (px per ms). */
const CLOSE_VELOCITY = 0.5;
/** Movement below this is a tap. */
const TAP_SLOP = 8;

const sheet = ref<HTMLElement | null>(null);

function onEnter(el: Element, done: () => void) {
  void animate(el, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: SLIDE_MS, easing: SLIDE_EASING }).then(done);
}
function onLeave(el: Element, done: () => void) {
  void animate(el, [{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: SLIDE_MS, easing: SLIDE_EASING, fill: 'forwards' }).then(done);
}

// ---- drag the grip down ----

interface DragState {
  pointerId: number;
  startY: number;
  startT: number;
  moved: boolean;
}
let drag: DragState | null = null;
// Set when a gesture on the grip ended as a drag, so the click the browser may still fire for it does not close the sheet.
let gestureWasDrag = false;
const dragPx = ref<number | null>(null);
const sheetStyle = computed(() => (dragPx.value === null ? undefined : { transform: `translateY(${dragPx.value}px)` }));

function onGripPointerDown(event: PointerEvent) {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  gestureWasDrag = false;
  drag = { pointerId: event.pointerId, startY: event.clientY, startT: performance.now(), moved: false };
}

function onGripPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dy = event.clientY - drag.startY;
  if (!drag.moved && Math.abs(dy) < TAP_SLOP) return;
  drag.moved = true;
  dragPx.value = Math.max(0, dy);
}

function endDrag(event: PointerEvent, cancelled: boolean) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const grip = event.currentTarget as HTMLElement;
  if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
  const { moved, startY, startT } = drag;
  drag = null;
  const dy = Math.max(0, event.clientY - startY);
  const velocity = performance.now() - startT > 0 ? dy / (performance.now() - startT) : 0;
  dragPx.value = null;
  // A tap is closed by the click that follows it (onGripClick), not here.
  if (!moved) return;
  gestureWasDrag = true;
  const height = sheet.value?.offsetHeight ?? 0;
  if (!cancelled && (dy > height * CLOSE_FRACTION || velocity > CLOSE_VELOCITY)) open.value = false;
}

// Taps (touch or mouse) and keyboard activation (Enter/Space, `detail === 0`) close; the click after a drag is skipped.
function onGripClick(event: MouseEvent) {
  if (event.detail !== 0 && gestureWasDrag) return;
  open.value = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value && layer.isTop.value) open.value = false;
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition :css="false" @enter="onEnter" @leave="onLeave">
    <section
      v-if="open"
      ref="sheet"
      v-phone-hidden="layer.hidden.value"
      class="phone-sheet"
      :class="{ 'is-dragging': dragPx !== null }"
      :style="sheetStyle"
      v-bind="$attrs"
      role="dialog"
      :aria-label="label"
    >
      <button
        type="button"
        class="grip"
        data-testid="phone-sheet-grip"
        :aria-label="t('common.buttons.close')"
        @pointerdown="onGripPointerDown"
        @pointermove="onGripPointerMove"
        @pointerup="endDrag($event, false)"
        @pointercancel="endDrag($event, true)"
        @click="onGripClick"
      >
        <span class="grip-bar" />
      </button>
      <div class="body">
        <slot />
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.phone-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--hud-inset-bottom, 0px);
  z-index: 40;
  max-height: 60%;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  box-sizing: border-box;
  background: var(--panel-bg);
  border-top: 1px solid var(--panel-border);
  transition: transform 180ms ease;
}
.phone-sheet.is-dragging {
  transition: none;
}
html[data-hud-motion='reduced'] .phone-sheet {
  transition: none;
}
/* A 44px tall hit area around the 36 x 4 grip. */
.grip {
  flex: none;
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0;
  background: none;
  border: 0;
  cursor: grab;
  touch-action: none;
}
.grip-bar {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
}
.grip:focus-visible {
  outline: 2px solid var(--gold, #ffc55c);
  outline-offset: -2px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
