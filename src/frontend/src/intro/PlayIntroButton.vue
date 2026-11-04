<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import './introButton.css';
import { introMounted } from './introSignal';
import { mountLandingIntro } from './startLandingIntro';

const { t } = useI18n({ useScope: 'global' });
</script>

<template>
  <Transition name="play-intro-fade">
    <button v-if="!introMounted" type="button" class="intro-btn play-intro" data-testid="play-intro" @click="mountLandingIntro()">
      {{ t('intro.playIntro') }}
    </button>
  </Transition>
</template>

<style scoped>
.play-intro {
  position: fixed;
  z-index: 6;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
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
