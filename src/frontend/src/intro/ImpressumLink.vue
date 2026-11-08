<script setup lang="ts">
import { introText, type IntroLocale } from './introText';

/** The small "Impressum" link shared by the intro's landing page and the pre-founding map view. The caller positions and sizes it. */
defineProps<{ locale: IntroLocale }>();
</script>

<template>
  <a class="legal" href="/impressum" data-testid="landing-impressum">{{ introText(locale, 'landing.impressum') }}</a>
</template>

<style scoped>
.legal {
  color: var(--legal-color, #b5a796);
  text-decoration: none;
}
.legal:hover,
.legal:focus-visible {
  color: #f4f1ea;
  text-decoration: underline;
}
</style>
