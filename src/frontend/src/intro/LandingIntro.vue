<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, shallowRef, watch } from 'vue';
import './introFog.css';
import { BEATS, BEAT_COMPONENTS } from './beats/registry';
import { introFogUrl } from './fogTexture';
import { introText, readingMs, type IntroLocale } from './introText';
import { INTRO_BEAT, type BeatId } from './beats/types';
import { IntroSequencer, type IntroState } from './sequencer';

// Mode, locale and reducedMotion are read once at mount: the sequencer is built
// for them and a change mid-play must not restart anything.
const props = defineProps<{
  mode: 'landing' | 'replay' | 'loop';
  /** loop mode: the beats to loop, defaults to all */
  loopBeats?: BeatId[];
  locale: IntroLocale;
  reducedMotion: boolean;
  loaded: boolean;
}>();
const emit = defineEmits<{ done: []; 'back-to-docs': []; 'enter-game': [] }>();

const FADE_OUT_MS = 1000;
const fogUrl = introFogUrl();
const exitMeta = BEATS.find((b) => b.role === 'exit')!;

const state = shallowRef<IntroState>({ phase: 'waitingForPlay', beat: BEATS[0].id, cycle: 0, skipVisible: false, paused: false });
const sequencer = new IntroSequencer({
  beats: BEATS,
  mode: props.mode,
  loopBeats: props.loopBeats,
  reducedMotion: props.reducedMotion,
  // the hold lasts at least as long as its narration takes to read
  holdMinMs: readingMs(introText(props.locale, 'beats.hold')),
  onChange: (s) => (state.value = s),
});
state.value = sequencer.state;

const meta = computed(() => BEATS.find((b) => b.id === state.value.beat)!);
provide(INTRO_BEAT, computed(() => state.value.beat));
// "Land!" cuts in at once instead of waiting for the narration's out-in crossfade
const isCall = computed(() => state.value.beat === 'landfall');
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
const pauseVisible = computed(() => state.value.phase === 'playing' || state.value.phase === 'exiting');
function togglePause(): void {
  if (state.value.paused) sequencer.resume();
  else sequencer.pause();
}
// Space toggles pause; a focused button (or field) already handles space itself.
function onKeydown(event: KeyboardEvent): void {
  if (event.code !== 'Space' || event.repeat || !pauseVisible.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest('button, input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  event.preventDefault();
  togglePause();
}
// A click or tap on the scene toggles pause like the button and space do; buttons keep their own action.
function onSceneClick(event: MouseEvent): void {
  if (!pauseVisible.value) return;
  if (event.target instanceof Element && event.target.closest('button')) return;
  togglePause();
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  sequencer.start();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  sequencer.dispose();
});
</script>

<template>
  <div
    v-if="state.phase !== 'done'"
    class="landing-intro"
    :class="{ 'is-fading': fadesOut, 'is-paused': state.paused }"
    :style="rootStyle"
    role="region"
    :aria-label="introText(locale, 'region')"
    data-testid="landing-intro"
    @click="onSceneClick"
    :data-beat="state.beat"
    :data-phase="state.phase"
  >
    <svg class="fog-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <pattern id="intro-fog" patternUnits="userSpaceOnUse" width="256" height="256">
          <image :href="fogUrl" width="256" height="256" />
        </pattern>
      </defs>
    </svg>

    <Transition name="intro-fade">
      <!-- beats sharing a scene keep one mounted component; the beat switches on it -->
      <div :key="meta.scene ?? state.beat" class="beat-layer" :style="beatStyle">
        <component :is="BEAT_COMPONENTS[state.beat]" :paused="state.phase === 'waitingForPlay' || state.paused" />
      </div>
    </Transition>

    <Transition :name="isCall ? 'intro-call' : 'intro-fade'" :mode="isCall ? undefined : 'out-in'">
      <p
        v-if="state.phase !== 'ended'"
        :key="state.beat"
        class="narration"
        :class="{ 'is-call': isCall }"
        aria-live="polite"
        data-testid="intro-narration"
      >
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

    <div class="actions">
      <!-- pause is the right-most button, so skip appearing to its left does not move it -->
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
        <button
          v-if="pauseVisible"
          type="button"
          class="intro-btn icon restart"
          :aria-label="introText(locale, 'restart')"
          data-testid="intro-restart"
          @click="sequencer.restart()"
        >
          <span aria-hidden="true">⟲</span>
        </button>
      </Transition>

      <Transition name="intro-fade">
        <button
          v-if="pauseVisible"
          type="button"
          class="intro-btn pause"
          :aria-pressed="state.paused"
          data-testid="intro-pause"
          @click="togglePause()"
        >
          {{ introText(locale, state.paused ? 'resume' : 'pause') }}
        </button>
      </Transition>
    </div>

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
.narration.is-call {
  font-size: clamp(2rem, 7vw, 4rem);
  font-style: italic;
  color: #1b262e;
  text-shadow: 0 0 18px rgba(233, 240, 244, 0.95), 0 0 4px rgba(233, 240, 244, 0.9);
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
.landing-intro.is-paused.is-fading {
  animation-play-state: paused;
}
.actions {
  position: absolute;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  display: flex;
  gap: 8px;
  pointer-events: none;
}
.intro-btn.icon {
  width: 44px;
  padding: 0;
  font-size: 1.4rem;
  line-height: 1;
}
.actions .intro-btn {
  position: static;
  pointer-events: auto;
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
.intro-call-enter-active,
.intro-call-leave-active {
  transition: opacity 250ms ease, transform 250ms ease;
}
.intro-call-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
.intro-call-leave-to {
  opacity: 0;
}
@keyframes intro-out {
  to {
    opacity: 0;
  }
}
</style>
