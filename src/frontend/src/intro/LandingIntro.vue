<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import './introFog.css';
import { BEATS, BEAT_COMPONENTS } from './beats/registry';
import { introFogUrl } from './fogTexture';
import { introText, type IntroLocale } from './introText';
import { IntroSequencer, type IntroState } from './sequencer';

// Mode, locale and reducedMotion are read once at mount: the sequencer is built
// for them and a change mid-play must not restart anything.
const props = defineProps<{
  mode: 'landing' | 'replay';
  locale: IntroLocale;
  reducedMotion: boolean;
  loaded: boolean;
}>();
const emit = defineEmits<{ done: []; 'back-to-docs': []; 'enter-game': [] }>();

const FADE_OUT_MS = 1000;
const fogUrl = introFogUrl();
const exitMeta = BEATS.find((b) => b.role === 'exit')!;

const state = shallowRef<IntroState>({ phase: 'waitingForPlay', beat: BEATS[0].id, cycle: 0, skipVisible: false });
const sequencer = new IntroSequencer({
  beats: BEATS,
  mode: props.mode,
  reducedMotion: props.reducedMotion,
  onChange: (s) => (state.value = s),
});
state.value = sequencer.state;

const meta = computed(() => BEATS.find((b) => b.id === state.value.beat)!);
const beatStyle = computed(() => ({
  '--beat-duration': `${meta.value.durationMs}ms`,
  '--loop-period': `${meta.value.loopMs ?? meta.value.durationMs}ms`,
}));
const rootStyle = computed(() => ({
  '--exit-ms': `${exitMeta.durationMs}ms`,
  '--fade-ms': `${FADE_OUT_MS}ms`,
}));
const fadesOut = computed(() => props.mode === 'landing' && state.value.phase === 'exiting');

watch(
  () => props.loaded,
  (loaded) => {
    if (loaded && props.mode === 'landing') sequencer.notifyLoaded();
  },
  { immediate: true },
);
watch(
  () => state.value.phase,
  (phase) => {
    if (phase === 'done') emit('done');
  },
);
onMounted(() => sequencer.start());
onBeforeUnmount(() => sequencer.dispose());
</script>

<template>
  <div
    v-if="state.phase !== 'done'"
    class="landing-intro"
    :class="{ 'is-fading': fadesOut }"
    :style="rootStyle"
    role="region"
    :aria-label="introText(locale, 'region')"
    data-testid="landing-intro"
    :data-beat="state.beat"
    :data-phase="state.phase"
  >
    <svg class="fog-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <!-- One 256 px texture stretched over 1024 beat units (a beat is 1600 wide): big soft banks, few visible repeats.
             introFog.css' drift keyframes move by the same 1024 so the loop is seamless. -->
        <pattern id="intro-fog" patternUnits="userSpaceOnUse" width="1024" height="1024">
          <image :href="fogUrl" width="1024" height="1024" preserveAspectRatio="none" />
        </pattern>
      </defs>
    </svg>

    <Transition name="intro-fade">
      <div :key="state.beat" class="beat-layer" :style="beatStyle">
        <component :is="BEAT_COMPONENTS[state.beat]" :paused="state.phase === 'waitingForPlay'" />
      </div>
    </Transition>

    <Transition name="intro-fade" mode="out-in">
      <p v-if="state.phase !== 'ended'" :key="state.beat" class="narration" aria-live="polite" data-testid="intro-narration">
        {{ introText(locale, 'beats.' + state.beat) }}
      </p>
    </Transition>

    <Transition name="intro-fade">
      <button
        v-if="state.phase === 'waitingForPlay'"
        type="button"
        class="intro-btn play"
        data-testid="intro-play"
        @click="sequencer.play()"
      >
        {{ introText(locale, 'play') }}
      </button>
    </Transition>

    <Transition name="intro-fade">
      <button
        v-if="state.skipVisible"
        type="button"
        class="intro-btn skip"
        data-testid="intro-skip"
        @click="sequencer.skip()"
      >
        {{ introText(locale, 'skip') }}
      </button>
    </Transition>

    <Transition name="intro-fade">
      <div v-if="state.phase === 'ended'" class="end" data-testid="intro-end">
        <button type="button" class="intro-btn dark" data-testid="intro-back-to-docs" @click="emit('back-to-docs')">
          {{ introText(locale, 'backToDocs') }}
        </button>
        <button type="button" class="intro-btn dark primary" data-testid="intro-enter-game" @click="emit('enter-game')">
          {{ introText(locale, 'enterGame') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.landing-intro {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  background: #0b1116;
  color: #f4f1ea;
}
.landing-intro.is-fading {
  animation: intro-out var(--fade-ms) linear forwards;
  animation-delay: calc(var(--exit-ms) - var(--fade-ms));
}
.fog-defs {
  position: absolute;
  width: 0;
  height: 0;
}
.beat-layer {
  position: absolute;
  inset: 0;
}
.narration {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 72px;
  margin: 0;
  text-align: center;
  font-size: 1.25rem;
  line-height: 1.3;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
.intro-btn {
  position: absolute;
  min-height: 44px;
  padding: 0 20px;
  border: 1px solid rgba(244, 241, 234, 0.6);
  border-radius: 8px;
  background: rgba(11, 17, 22, 0.55);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.skip {
  right: 16px;
  bottom: 16px;
}
.play {
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  max-width: calc(100% - 32px);
}
.end {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: #fff;
}
.end .intro-btn {
  position: static;
  min-width: 200px;
}
.intro-btn.dark {
  color: #0b1116;
  background: #fff;
  border-color: #0b1116;
}
.intro-btn.primary {
  background: #0b1116;
  color: #fff;
}
.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 600ms ease;
}
.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}
@keyframes intro-out {
  to {
    opacity: 0;
  }
}
</style>
