<script setup lang="ts">
// The one place a ring menu is mounted and unmounted: a <Transition> that
// holds the DOM while the bubbles are pulled into the hub and the hub fades
// (or, after a confirmed build, the chosen bubble drops onto the hex).
// `retractRing` makes the leaving ring click-through first, so a map drag
// started on it still begins immediately, and respects the motion settings
// (it resolves at once with motion off). MapView and LandingView both put
// their <RingMenu v-if> in this host's slot, so the close animation can't
// exist in one view and be missing in the other.
import { retractRing } from '../../lib/map/ringMotion';

const emit = defineEmits<{
  /** The retract finished (or was skipped) and the ring is about to leave the DOM. */
  retracted: [];
}>();

function onLeave(el: Element, done: () => void) {
  const finish = () => {
    emit('retracted');
    done();
  };
  retractRing(el as HTMLElement).then(finish, finish);
}
</script>

<template>
  <Transition :css="false" @leave="onLeave">
    <slot />
  </Transition>
</template>
