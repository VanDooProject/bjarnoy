<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import LandingIntro from '../intro/LandingIntro.vue';
import { motionPreferences } from '../lib/perf/motionPreferences';

// The intro again, from the saga docs page. The same component the landing page plays; it ends on a choice
// between the docs and the game, and this view navigates.
const { locale } = useI18n({ useScope: 'global' });
const router = useRouter();
const introLocale = computed<'en' | 'de'>(() => (locale.value === 'de' ? 'de' : 'en'));
</script>

<template>
  <LandingIntro
    mode="replay"
    :locale="introLocale"
    :reduced-motion="!motionPreferences.hudEnabled"
    :loaded="false"
    @back-to-docs="router.push('/docs/saga')"
    @enter-game="router.push('/')"
  />
</template>
