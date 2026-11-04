<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { BEATS } from '../intro/beats/registry';
import LandingIntro from '../intro/LandingIntro.vue';
import { parseLoopAnchor } from '../intro/loopAnchor';
import { motionPreferences } from '../lib/perf/motionPreferences';

// The intro again, from the saga docs page. The same component the landing page plays; it ends on a choice
// between the docs and the game, and this view navigates.
const { locale } = useI18n({ useScope: 'global' });
const router = useRouter();
// `#loop` / `#loop(1-2,5)` plays the intro without end instead of the replay (read once, like the intro's other inputs)
const loopBeats = parseLoopAnchor(useRoute().hash, BEATS);
const toDocs = () => router.push('/docs/saga');
const introLocale = computed<'en' | 'de'>(() => (locale.value === 'de' ? 'de' : 'en'));
</script>

<template>
  <LandingIntro
    :mode="loopBeats ? 'loop' : 'replay'"
    :loop-beats="loopBeats ?? undefined"
    :locale="introLocale"
    :reduced-motion="!motionPreferences.hudEnabled"
    :loaded="false"
    @back-to-docs="toDocs"
    @close="toDocs"
    @enter-game="router.push('/')"
  />
</template>
