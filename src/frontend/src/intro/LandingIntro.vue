<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import './introFog.css';
import { BEATS, BEAT_COMPONENTS } from './beats/registry';
import { introFogUrl } from './fogTexture';
import { introText, type IntroLocale } from './introText';
import { beatsFor, holdMinMs, IntroVoice, type VoiceState } from './introVoice';
import { INTRO_BEAT, INTRO_BEAT_MS, type BeatId } from './beats/types';
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
  /** initial sound state; the clips play either way, muted while it is off */
  soundOn: boolean;
}>();
const emit = defineEmits<{ done: []; 'back-to-docs': []; 'enter-game': [] }>();

const FADE_OUT_MS = 1000;
const fogUrl = introFogUrl();
// Each intro beat lasts as long as its voice clip in the player's language (plus a tail).
const beats = beatsFor(props.locale, BEATS);
const exitMeta = beats.find((b) => b.role === 'exit')!;

const state = shallowRef<IntroState>({ phase: 'waitingForPlay', beat: beats[0].id, cycle: 0, round: 0, skipVisible: false, paused: false });
const sequencer = new IntroSequencer({
  beats,
  mode: props.mode,
  loopBeats: props.loopBeats,
  reducedMotion: props.reducedMotion,
  // the hold lasts at least as long as its voice clip (plus the tail)
  holdMinMs: holdMinMs(props.locale),
  onChange: (s) => (state.value = s),
});
state.value = sequencer.state;

const meta = computed(() => beats.find((b) => b.id === state.value.beat)!);
provide(INTRO_BEAT, computed(() => state.value.beat));
provide(INTRO_BEAT_MS, (id: BeatId) => beats.find((b) => b.id === id)!.durationMs);

// The voice loads its clips now, before the map tiles; each clip starts with its beat (muted while the sound is off).
const sound = ref(props.soundOn);
const voiceBeat = ref<BeatId | null>(null);
const voiceState = ref<VoiceState>('stopped');
const voice = new IntroVoice({
  locale: props.locale,
  sound: props.soundOn,
  // the browser only allows sound after a click
  onSoundBlocked: () => (sound.value = false),
  onStateChange: (beat, st) => {
    voiceBeat.value = beat;
    voiceState.value = st;
  },
});
let voicedKey: string | null = null;
watch(
  () => [state.value.phase, state.value.beat, state.value.round, state.value.paused] as const,
  ([phase, beat, round, paused]) => {
    if (phase === 'done' || phase === 'ended') {
      voice.stop();
      voicedKey = null;
      return;
    }
    if (phase === 'waitingForPlay') return;
    const key = `${beat}:${round}`;
    if (key !== voicedKey) {
      voicedKey = key;
      voice.enterBeat(beat);
    }
    if (paused) voice.pause();
    else voice.resume();
  },
  { immediate: true },
);
function toggleSound(): void {
  sound.value = !sound.value;
  voice.setSound(sound.value);
}
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
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  sequencer.start();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  sequencer.dispose();
  voice.dispose();
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
    :data-beat="state.beat"
    :data-phase="state.phase"
    :data-voice-beat="voiceBeat ?? undefined"
    :data-voice-state="voiceState"
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
      <div :key="`${meta.scene ?? state.beat}:${state.round}`" class="beat-layer" :style="beatStyle">
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
      <!-- sound is the right-most button, so skip and pause appearing to its left do not move it -->
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
          class="intro-btn pause"
          :aria-pressed="state.paused"
          data-testid="intro-pause"
          @click="togglePause()"
        >
          {{ introText(locale, state.paused ? 'resume' : 'pause') }}
        </button>
      </Transition>

      <Transition name="intro-fade">
        <button
          v-if="pauseVisible"
          type="button"
          class="intro-btn sound"
          :class="{ 'is-muted': !sound, 'is-still': reducedMotion }"
          :aria-label="introText(locale, sound ? 'soundOff' : 'soundOn')"
          :aria-pressed="sound"
          data-testid="intro-sound"
          :data-sound="sound ? 'on' : 'off'"
          @click="toggleSound()"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
            <template v-if="sound">
              <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
              <path d="M18 7a7 7 0 0 1 0 10" />
            </template>
            <path v-else d="M16 9.5l5 5M21 9.5l-5 5" />
          </svg>
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
.actions .intro-btn {
  position: static;
  pointer-events: auto;
}
.intro-btn.sound {
  display: grid;
  place-items: center;
  min-width: 44px;
  padding: 0;
}
/* the sound is off (the browser starts it so): the button draws the eye until it is turned on */
.intro-btn.sound.is-muted {
  border-color: #f4f1ea;
  box-shadow: 0 0 0 2px rgba(244, 241, 234, 0.45);
}
.intro-btn.sound.is-muted:not(.is-still) {
  animation: intro-sound-blink 1200ms ease-in-out infinite;
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
@keyframes intro-sound-blink {
  0%,
  100% {
    border-color: rgba(244, 241, 234, 0.6);
    box-shadow: 0 0 0 0 rgba(244, 241, 234, 0);
  }
  50% {
    border-color: #f4f1ea;
    box-shadow: 0 0 10px 3px rgba(244, 241, 234, 0.6);
  }
}
@keyframes intro-out {
  to {
    opacity: 0;
  }
}
</style>
