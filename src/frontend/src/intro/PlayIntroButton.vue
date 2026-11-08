<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import './introButton.css';
import { introMounted } from './introSignal';
import { mountLandingIntro } from './startLandingIntro';

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <Transition name="play-intro-fade">
    <button v-if="!introMounted" type="button" class="intro-btn play-intro" data-testid="play-intro" @click="mountLandingIntro({ playNow: true })">
      {{ t('intro.playIntro') }}
    </button>
  </Transition>
</template>

<style scoped>
.play-intro {
  position: fixed;
  /* above MapStatusOverlay (9): the button stays usable while the world loads */
  z-index: 15;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
}
/* left out on phones: the onboarding checklist covers the bottom right there (same breakpoint as its tray); the landing menu has a "Play intro" row instead (ReturningPlayerMenu.vue) */
@media (max-width: 768px), (max-height: 500px) {
  .play-intro {
    display: none;
  }
}
.play-intro-fade-enter-active,
.play-intro-fade-leave-active {
  transition: opacity 600ms ease;
}
.play-intro-fade-enter-from,
.play-intro-fade-leave-to {
  opacity: 0;
}
</style>
