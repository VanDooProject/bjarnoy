<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';
import './introFog.css';
import './introButton.css';
import { BEATS, BEAT_COMPONENTS } from './beats/registry';
import { introFogUrl } from './fogTexture';
import { introText, type IntroLocale } from './introText';
import { beatsFor, holdMinMs, IntroVoice, type VoiceState } from './introVoice';
import { INTRO_BEAT, INTRO_BEAT_MS, type BeatId } from './beats/types';
import IntroTimeline from './IntroTimeline.vue';
import { introLoad, mapLoadFraction } from './introLoad';
import LandingPage from './LandingPage.vue';
import { allLoaded, gatedLoadFraction, type LoadRow } from './timeline';
import { IntroSequencer, type IntroState } from './sequencer';
import { introSignal } from './introSignal';
import { useIdleDim } from './useIdleDim';

// Mode, locale and reducedMotion are read once at mount: the sequencer is built
// for them and a change mid-play must not restart anything.
const props = defineProps<{
  mode: 'landing' | 'replay' | 'loop';
  /** loop mode: the beats to loop, defaults to all */
  loopBeats?: BeatId[];
  locale: IntroLocale;
  reducedMotion: boolean;
  /** the player asked for the intro: it plays at once, also with reduced motion */
  playNow?: boolean;
  loaded: boolean;
  /** read once at mount: a stored login turns the top-right "Log in" into "Enter world" */
  loggedIn?: boolean;
  /** initial sound state; the clips play either way, muted while it is off */
  soundOn: boolean;
}>();
const emit = defineEmits<{ done: []; close: []; 'back-to-docs': []; 'enter-game': [] }>();

const FADE_OUT_MS = 1000;
const SCENE_FADE_MS = 600;
// The skip button stays at full strength this long after it appears, so it is noticed before it dims.
const SKIP_FRESH_MS = 3000;
const fogUrl = introFogUrl();
// Each intro beat lasts as long as its voice clip in the player's language (plus a tail).
const beats = beatsFor(props.locale, BEATS);
const exitMeta = beats.find((b) => b.role === 'exit')!;

const state = shallowRef<IntroState>({
  phase: 'waitingForPlay',
  beat: beats[0].id,
  cycle: 0,
  round: 0,
  skipVisible: false,
  paused: false,
  offsetMs: 0,
  seq: 0,
  waiting: false,
});
// A seek switches scene and narration at once (no crossfade); a beat change on the timers fades again.
const instant = ref(false);
// While set, the scene is shown as this beat: a seek into a later beat of a shared scene mounts the scene as its first beat.
const sceneStage = ref<BeatId | null>(null);
let pendingSync: { lead: number; offset: number; twoStep: boolean } | null = null;
function onChange(next: IntroState): void {
  const prev = state.value;
  if (next.seq !== prev.seq) {
    instant.value = true;
    const start = sceneStart(next.beat);
    sceneStage.value = start ? start.first : null;
    pendingSync = { lead: start?.lead ?? 0, offset: next.offsetMs, twoStep: start !== null };
  } else if (next.beat !== prev.beat || next.round !== prev.round) instant.value = false;
  state.value = next;
}
const sequencer = new IntroSequencer({
  beats,
  mode: props.mode,
  loopBeats: props.loopBeats,
  reducedMotion: props.reducedMotion,
  playNow: props.playNow,
  // the hold lasts at least as long as its voice clip (plus the tail)
  holdMinMs: holdMinMs(props.locale),
  onChange,
});
const timeline = sequencer.timeline;
state.value = sequencer.state;

const metaOf = (id: BeatId) => beats.find((b) => b.id === id)!;
const meta = computed(() => metaOf(state.value.beat));
const shownBeat = computed(() => sceneStage.value ?? state.value.beat);
const shownMeta = computed(() => metaOf(shownBeat.value));
provide(INTRO_BEAT, shownBeat);
provide(INTRO_BEAT_MS, (id: BeatId) => beats.find((b) => b.id === id)!.durationMs);

// The voice loads its clips now, before the map tiles; each clip starts with its beat (muted while the sound is off).
const sound = ref(props.soundOn);
const voiceBeat = ref<BeatId | null>(null);
const voiceState = ref<VoiceState>('stopped');
const voiceProgress = ref({ loaded: 0, total: 0 });
const voice = new IntroVoice({
  locale: props.locale,
  sound: props.soundOn,
  onLoadProgress: (loaded, total) => (voiceProgress.value = { loaded, total }),
  // the browser only allows sound after a click
  onSoundBlocked: () => (sound.value = false),
  onStateChange: (beat, st) => {
    voiceBeat.value = beat;
    voiceState.value = st;
  },
});
let voicedKey: string | null = null;
// Set while the playhead is dragged (see the timeline section below).
const scrubbing = ref(false);
watch(
  () => [state.value.phase, state.value.beat, state.value.round, state.value.seq, state.value.paused, scrubbing.value] as const,
  ([phase, beat, round, seq, paused, scrub]) => {
    if (phase === 'done' || phase === 'ended') {
      voice.stop();
      voicedKey = null;
      return;
    }
    if (phase === 'waitingForPlay') return;
    // a drag seeks on every move: the clip stays paused and joins once, where the drag lets go
    if (scrub) {
      voice.pause();
      return;
    }
    const key = `${beat}:${round}:${seq}`;
    if (key !== voicedKey) {
      voicedKey = key;
      voice.enterBeat(beat, state.value.offsetMs);
    }
    if (paused) voice.pause();
    else voice.resume();
  },
  { immediate: true },
);
// 0..100. Muting keeps it, so unmuting brings the level back.
const volume = ref(100);
// Both run in a user gesture, which is when the voice may start its audio context.
function applyVoiceLevel(): void {
  voice.setVolume(volume.value / 100);
  voice.setSound(sound.value);
}
function toggleSound(): void {
  if (!sound.value && volume.value === 0) volume.value = 50;
  sound.value = !sound.value;
  applyVoiceLevel();
}
// Dragging the range above 0 unmutes, to 0 mutes.
function setVolume(value: number): void {
  volume.value = value;
  sound.value = value > 0;
  applyVoiceLevel();
}
// "Land!" cuts in at once instead of waiting for the narration's out-in crossfade
const isCall = computed(() => state.value.beat === 'landfall');
const beatStyle = computed(() => ({
  '--beat-duration': `${shownMeta.value.durationMs}ms`,
  '--loop-period': `${shownMeta.value.loopMs ?? shownMeta.value.durationMs}ms`,
}));
const rootStyle = computed(() => ({
  '--exit-ms': `${exitMeta.durationMs}ms`,
  '--exit-offset': `${state.value.phase === 'exiting' ? state.value.offsetMs : 0}ms`,
  '--fade-ms': `${FADE_OUT_MS}ms`,
  // the crossfade into the current beat's scene (a beat can ask for a longer one)
  '--scene-fade-ms': `${meta.value.fadeInMs ?? SCENE_FADE_MS}ms`,
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
const loggedIn = props.loggedIn ?? false;
const loginVisible = computed(() => (props.mode === 'landing' || props.mode === 'loop') && state.value.phase !== 'ended');
const idle = useIdleDim();
const dimmed = computed(() => idle.value && !state.value.paused);
const skipFresh = ref(false);
let skipFreshTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => state.value.skipVisible,
  (visible) => {
    clearTimeout(skipFreshTimer);
    skipFresh.value = visible;
    if (visible) skipFreshTimer = setTimeout(() => (skipFresh.value = false), SKIP_FRESH_MS);
  },
  { immediate: true },
);
const pauseVisible = computed(() => state.value.phase === 'playing' || state.value.phase === 'exiting');
function togglePause(): void {
  if (state.value.paused) sequencer.resume();
  else sequencer.pause();
}

// ---- timeline
// Dragging the playhead pauses the run (and its voice); letting go resumes it if it was playing.
// A drag that starts paused stays paused after it, but its moves still must not re-enter the clip each time.
let pausedBeforeDrag = false;
function onDragStart(): void {
  pausedBeforeDrag = state.value.paused;
  scrubbing.value = true;
  sequencer.pause();
}
function onDragEnd(): void {
  if (!scrubbing.value) return;
  scrubbing.value = false;
  if (!pausedBeforeDrag) sequencer.resume();
}
/** What the player paused, not the pause a drag puts on the run. */
const pausedByPlayer = computed(() => state.value.paused && !(scrubbing.value && !pausedBeforeDrag));
const landing = props.mode === 'landing';
const gated = computed(() => landing && !props.loaded);
const barLocked = computed(() => landing && state.value.phase === 'exiting');
const loadRows = computed<LoadRow[]>(() => {
  if (!landing) return [];
  const rows: LoadRow[] = [{ id: 'voices', ...voiceProgress.value, gating: true }];
  // terrain and buildings are listed from the start: a group that has not reported a page yet shows 0 of an unknown total
  for (const id of ['terrain', 'buildings'] as const) {
    const count = introLoad[id] ?? { loaded: 0, total: 0 };
    rows.push({ id, loaded: count.loaded, total: count.total, gating: true });
  }
  if (introLoad.animations) rows.push({ id: 'animations', ...introLoad.animations, gating: false });
  return rows;
});
const loadFraction = computed(() => gatedLoadFraction(loadRows.value));
// the rows to list while the bar is open: none once everything has loaded
const detailRows = computed(() => (allLoaded(loadRows.value) ? [] : loadRows.value));
const detailOpen = ref(false);

// ---- landing page: over the first scene until the saga starts (or the player goes to the map)
const showLanding = computed(() => props.mode === 'landing' && state.value.phase === 'waitingForPlay');
const mapFraction = computed(() => mapLoadFraction(introLoad, props.loaded));
// a click is a user gesture, which is when the browser allows sound
function startSaga(withSound: boolean): void {
  if (sound.value !== withSound) {
    sound.value = withSound;
    applyVoiceLevel();
  }
  sequencer.play();
}

// A seek puts every CSS animation of the new scene where a straight play would have it: "the time since it would
// have started". Only `currentTime` is set (never play()/pause(), which would override the CSS play-state a pause
// relies on). A beat that shares a scene with earlier beats is mounted as the scene's first beat and timed to
// the scene's time, then switched to the target beat; only the animations that switch adds start at the offset.
function sceneStart(beat: BeatId): { first: BeatId; lead: number } | null {
  const { chapters } = timeline;
  const index = chapters.findIndex((c) => c.id === beat);
  const scene = metaOf(beat).scene;
  if (index < 1 || !scene) return null;
  let first = index;
  while (first > 0 && metaOf(chapters[first - 1].id).scene === scene) first--;
  return first === index ? null : { first: chapters[first].id, lead: chapters[index].startMs - chapters[first].startMs };
}
const rootEl = useTemplateRef<HTMLElement>('root');
function layerAnimations(layer: Element): Animation[] {
  return typeof layer.getAnimations === 'function' ? layer.getAnimations({ subtree: true }) : [];
}
watch(
  () => state.value.seq,
  async () => {
    const sync = pendingSync;
    pendingSync = null;
    if (!sync) return;
    const layers = rootEl.value?.querySelectorAll('.beat-layer');
    const layer = layers?.[layers.length - 1];
    const finish = () => (sceneStage.value = null);
    if (!layer) return finish();
    for (const anim of layerAnimations(layer)) anim.currentTime = sync.lead + sync.offset;
    if (!sync.twoStep) return;
    const before = new Set(layerAnimations(layer));
    finish();
    await nextTick();
    for (const anim of layerAnimations(layer)) if (!before.has(anim)) anim.currentTime = sync.offset;
  },
  { flush: 'post' },
);
// Esc closes the intro at once: no exit beat, no fade.
function close(): void {
  sequencer.close();
  emit('close');
}
function onLogin(): void {
  close();
  if (!loggedIn) introSignal.loginRequested = true;
}
// Space toggles pause; a focused button (or field) already handles space itself.
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (!event.repeat && state.value.phase !== 'done') close();
    return;
  }
  if (event.code !== 'Space' || event.repeat || !pauseVisible.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest('button, input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  event.preventDefault();
  togglePause();
}
// A click or tap on the scene toggles pause like the button and space do; buttons and the control row keep their own action.
function onSceneClick(event: MouseEvent): void {
  if (!pauseVisible.value) return;
  // the path, not the target: a button that re-renders its icon on this very click has already replaced the target
  if (event.composedPath().some((node) => node instanceof Element && node.matches('button, .ctrl'))) return;
  togglePause();
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  sequencer.start();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  clearTimeout(skipFreshTimer);
  sequencer.dispose();
  voice.dispose();
});
</script>

<template>
  <div
    v-if="state.phase !== 'done'"
    class="landing-intro"
    ref="root"
    :class="{ 'is-fading': fadesOut, 'is-paused': state.paused, 'is-idle': dimmed, 'detail-open': detailOpen && pauseVisible, 'is-still': reducedMotion }"
    :style="rootStyle"
    role="region"
    :aria-label="introText(locale, 'region')"
    data-testid="landing-intro"
    @click="onSceneClick"
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

    <!-- a seek swaps scene and narration at once instead of crossfading -->
    <Transition name="intro-fade" :css="!instant">
      <!-- beats sharing a scene keep one mounted component; the beat switches on it. A seek within the mounted
           scene does not remount it: the seek sync below moves its animations instead -->
      <div :key="`${meta.scene ?? state.beat}:${state.round}`" class="beat-layer" :style="beatStyle">
        <!-- behind the landing page the hall lives (fire, smoke), only its turn into the saga waits for the click -->
        <component :is="BEAT_COMPONENTS[shownBeat]" :paused="(state.phase === 'waitingForPlay' && !showLanding) || state.paused" v-bind="showLanding ? { held: true } : {}" />
      </div>
    </Transition>

    <!-- (not css=false: an out-in leave that ends synchronously updates this component in the middle of its own patch) -->
    <Transition :name="instant ? 'intro-instant' : isCall ? 'intro-call' : 'intro-fade'" :mode="isCall ? undefined : 'out-in'">
      <p
        v-if="state.phase !== 'ended' && !showLanding"
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
      <LandingPage
        v-if="showLanding"
        :locale="locale"
        :load-fraction="mapFraction"
        @hear="startSaga(true)"
        @muted="startSaga(false)"
        @map="close()"
      />
    </Transition>

    <Transition name="intro-fade">
      <button
        v-if="state.phase === 'waitingForPlay' && !showLanding"
        type="button"
        class="intro-btn play"
        data-testid="intro-play"
        @click="sequencer.play()"
      >
        {{ introText(locale, 'play') }}
      </button>
    </Transition>

    <div class="topright">
      <Transition name="intro-fade">
        <a v-if="showLanding" class="howto" href="/docs" data-testid="landing-how-to-play">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z" />
            <path d="M12 6v14" />
          </svg>
          {{ introText(locale, 'howToPlay') }}
        </a>
      </Transition>
      <Transition name="intro-fade">
        <button
          v-if="loginVisible"
          type="button"
          class="intro-btn login"
          data-testid="intro-login"
          :data-login-state="loggedIn ? 'enter' : 'login'"
          @click="onLogin()"
        >
          {{ introText(locale, loggedIn ? 'enterWorld' : 'login') }}
        </button>
      </Transition>
    </div>

    <div class="actions">
      <Transition name="intro-fade">
        <button
          v-if="state.skipVisible"
          type="button"
          class="intro-btn skip"
          :class="{ 'is-fresh': skipFresh }"
          data-testid="intro-skip"
          @click="sequencer.skip()"
        >
          {{ introText(locale, 'skip') }}
        </button>
      </Transition>
    </div>

    <Transition name="intro-cplay">
      <button
        v-if="pauseVisible && pausedByPlayer"
        type="button"
        class="cplay"
        :aria-label="introText(locale, 'resume')"
        data-testid="intro-center-play"
        @click="togglePause()"
      >
        <svg viewBox="0 0 24 24" width="72" height="72" aria-hidden="true">
          <path d="M8 5.6v12.8a1.2 1.2 0 0 0 1.8 1l10.2-6.4a1.2 1.2 0 0 0 0-2L9.8 4.6A1.2 1.2 0 0 0 8 5.6z" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
        </svg>
      </button>
    </Transition>

    <!-- a soft dark band under the control row, so its text reads on the bright fog and landfall scenes too -->
    <Transition name="intro-fade">
      <div v-if="pauseVisible" class="ctrl-scrim" aria-hidden="true" />
    </Transition>

    <Transition name="intro-fade">
      <IntroTimeline
        v-if="pauseVisible"
        :timeline="timeline"
        :state="state"
        :get-position="() => sequencer.positionMs()"
        :locale="locale"
        :paused="pausedByPlayer"
        :gated="gated"
        :locked="barLocked"
        :load-fraction="loadFraction"
        :load-rows="detailRows"
        :sound="sound"
        :volume="volume"
        :reduced-motion="reducedMotion"
        @seek="sequencer.seek($event)"
        @drag-start="onDragStart"
        @drag-end="onDragEnd"
        @toggle-pause="togglePause()"
        @sound="toggleSound()"
        @volume="setVolume($event)"
        @detail-open="detailOpen = $event"
      />
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
  /* a seek into the landfall joins the exit --exit-offset in */
  animation-delay: calc(var(--exit-ms) - var(--fade-ms) - var(--exit-offset, 0ms));
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
  /* above skip, which sits above the control row */
  bottom: calc(max(16px, env(safe-area-inset-bottom)) + 108px);
  margin: 0;
  text-align: center;
  font-size: 1.25rem;
  line-height: 1.3;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  transition: transform 200ms ease;
}
/* the load list opens over the control row and needs the room */
.landing-intro.detail-open .narration {
  transform: translateY(-56px);
}
.landing-intro.is-still .narration {
  transition: none;
}
.narration.is-call {
  font-size: clamp(2rem, 7vw, 4rem);
  font-style: italic;
  color: #1b262e;
  text-shadow: 0 0 18px rgba(233, 240, 244, 0.95), 0 0 4px rgba(233, 240, 244, 0.9);
}
.intro-btn {
  position: absolute;
}
.landing-intro.is-paused.is-fading {
  animation-play-state: paused;
}
.actions {
  position: absolute;
  right: max(16px, env(safe-area-inset-right));
  /* above the control row (44px) */
  bottom: calc(max(16px, env(safe-area-inset-bottom)) + 52px);
  display: flex;
  gap: 8px;
  pointer-events: none;
}
/* top-right: "How to play" link left of the login button, vertically centred with it */
.topright {
  position: absolute;
  top: max(16px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 18px;
}
.topright .intro-btn.login {
  position: static;
}
.howto {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #f4f1ea;
  font-size: 15px;
  text-decoration: none;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.7);
}
.howto:hover,
.howto:focus-visible {
  text-decoration: underline;
  text-underline-offset: 4px;
}
/*
 * Idle: the controls fade back. Opacity only. The enter/leave states of the intro-fade transition (also opacity)
 * are excluded so they keep animating from/to 0; the skip button is exempt while it is fresh.
 */
.landing-intro.is-idle .actions .intro-btn:not(.is-fresh):not(.intro-fade-enter-from):not(.intro-fade-leave-to),
.landing-intro.is-idle .ctrl:not(.intro-fade-enter-from):not(.intro-fade-leave-to),
.landing-intro.is-idle .intro-btn.login:not(.intro-fade-enter-from):not(.intro-fade-leave-to),
.landing-intro.is-idle .howto:not(.intro-fade-enter-from):not(.intro-fade-leave-to) {
  opacity: 0.35;
  transition: opacity 600ms ease;
}
.landing-intro.is-idle .actions .intro-btn:not(.intro-fade-enter-from):not(.intro-fade-leave-to):hover,
.landing-intro.is-idle .actions .intro-btn:not(.intro-fade-enter-from):not(.intro-fade-leave-to):focus-visible,
.landing-intro.is-idle .ctrl:not(.intro-fade-enter-from):not(.intro-fade-leave-to):hover,
.landing-intro.is-idle .ctrl:not(.intro-fade-enter-from):not(.intro-fade-leave-to):focus-within,
.landing-intro.is-idle .intro-btn.login:not(.intro-fade-enter-from):not(.intro-fade-leave-to):hover,
.landing-intro.is-idle .intro-btn.login:not(.intro-fade-enter-from):not(.intro-fade-leave-to):focus-visible,
.landing-intro.is-idle .howto:not(.intro-fade-enter-from):not(.intro-fade-leave-to):hover,
.landing-intro.is-idle .howto:not(.intro-fade-enter-from):not(.intro-fade-leave-to):focus-visible {
  opacity: 1;
}
.actions .intro-btn {
  position: static;
  pointer-events: auto;
}
/* the centre play symbol shows while paused: a soft triangle, no ring or disc */
.cplay {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 112px;
  height: 112px;
  translate: -50% -50%;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #f4f1ea;
  cursor: pointer;
  /* a tight dark edge plus a wide soft shadow: the pale symbol still reads on the bright fog */
  filter: drop-shadow(0 0 1.5px rgba(11, 17, 22, 0.55)) drop-shadow(0 3px 22px rgba(11, 17, 22, 0.7));
  z-index: 2;
}
.ctrl-scrim {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(240px + env(safe-area-inset-bottom));
  background: linear-gradient(
    to top,
    rgba(11, 17, 22, 0.82),
    rgba(11, 17, 22, 0.72) 22%,
    rgba(11, 17, 22, 0.45) 50%,
    rgba(11, 17, 22, 0.15) 78%,
    rgba(11, 17, 22, 0)
  );
  pointer-events: none;
}
/* opacity on the whole symbol, so fill and rounded stroke do not overlap into a lighter rim */
.cplay svg {
  opacity: 0.82;
  transition: opacity 150ms ease, transform 180ms ease;
}
.cplay:hover svg,
.cplay:focus-visible svg {
  opacity: 0.95;
  transform: scale(1.18);
}
.cplay:focus-visible {
  outline: 2px solid #f4f1ea;
  outline-offset: -8px;
  border-radius: 50%;
}
.landing-intro.is-still .cplay svg {
  transition: none;
}
.intro-cplay-enter-active,
.intro-cplay-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.intro-cplay-enter-from,
.intro-cplay-leave-to {
  opacity: 0;
  transform: scale(0.85);
}
.landing-intro.is-still .intro-cplay-enter-active,
.landing-intro.is-still .intro-cplay-leave-active {
  transition: none;
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
/* the scene crossfade: both layers take the entering beat's length (--scene-fade-ms on the root) */
.beat-layer.intro-fade-enter-active,
.beat-layer.intro-fade-leave-active {
  transition-duration: var(--scene-fade-ms, 600ms);
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
