/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';
import './introFog.css';
import './introButton.css';
import { BEATS, BEAT_COMPONENTS } from './beats/registry';
import { introFogUrl } from './fogTexture';
import { introText } from './introText';
import { beatsFor, holdMinMs, IntroVoice } from './introVoice';
import { INTRO_BEAT, INTRO_BEAT_MS } from './beats/types';
import IntroTimeline from './IntroTimeline.vue';
import { introLoad, mapLoadFraction } from './introLoad';
import LandingPage from './LandingPage.vue';
import { allLoaded, gatedLoadFraction } from './timeline';
import { IntroSequencer } from './sequencer';
import { introSignal } from './introSignal';
import { useIdleDim } from './useIdleDim';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const FADE_OUT_MS = 1000;
const SCENE_FADE_MS = 600;
// The skip button stays at full strength this long after it appears, so it is noticed before it dims.
const SKIP_FRESH_MS = 3000;
const fogUrl = introFogUrl();
// Each intro beat lasts as long as its voice clip in the player's language (plus a tail).
const beats = beatsFor(props.locale, BEATS);
const exitMeta = beats.find((b) => b.role === 'exit');
const state = shallowRef({
    phase: 'waitingForPlay',
    beat: beats[0].id,
    cycle: 0,
    round: 0,
    skipVisible: false,
    paused: false,
    offsetMs: 0,
    seq: 0,
    waiting: false,
    closed: false,
});
// A seek switches scene and narration at once (no crossfade); a beat change on the timers fades again.
const instant = ref(false);
// While set, the scene is shown as this beat: a seek into a later beat of a shared scene mounts the scene as its first beat.
const sceneStage = ref(null);
let pendingSync = null;
function onChange(next) {
    const prev = state.value;
    if (next.seq !== prev.seq) {
        instant.value = true;
        const start = sceneStart(next.beat);
        sceneStage.value = start ? start.first : null;
        pendingSync = { lead: start?.lead ?? 0, offset: next.offsetMs, twoStep: start !== null };
    }
    else if (next.beat !== prev.beat || next.round !== prev.round)
        instant.value = false;
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
const metaOf = (id) => beats.find((b) => b.id === id);
const meta = computed(() => metaOf(state.value.beat));
const shownBeat = computed(() => sceneStage.value ?? state.value.beat);
const shownMeta = computed(() => metaOf(shownBeat.value));
provide(INTRO_BEAT, shownBeat);
provide(INTRO_BEAT_MS, (id) => beats.find((b) => b.id === id).durationMs);
// The voice loads its clips now, before the map tiles; each clip starts with its beat (muted while the sound is off).
const sound = ref(props.soundOn);
const voiceBeat = ref(null);
const voiceState = ref('stopped');
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
let voicedKey = null;
// Set while the playhead is dragged (see the timeline section below).
const scrubbing = ref(false);
watch(() => [state.value.phase, state.value.beat, state.value.round, state.value.seq, state.value.paused, scrubbing.value], ([phase, beat, round, seq, paused, scrub]) => {
    if (phase === 'done' || phase === 'ended') {
        voice.stop();
        voicedKey = null;
        return;
    }
    if (phase === 'waitingForPlay')
        return;
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
    if (paused)
        voice.pause();
    else
        voice.resume();
}, { immediate: true });
// 0..100. Muting keeps it, so unmuting brings the level back.
const volume = ref(100);
// Both run in a user gesture, which is when the voice may start its audio context.
function applyVoiceLevel() {
    voice.setVolume(volume.value / 100);
    voice.setSound(sound.value);
}
function toggleSound() {
    if (!sound.value && volume.value === 0)
        volume.value = 50;
    sound.value = !sound.value;
    applyVoiceLevel();
}
// Dragging the range above 0 unmutes, to 0 mutes.
function setVolume(value) {
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
watch(() => props.loaded, (loaded) => {
    if (loaded && props.mode === 'landing')
        sequencer.notifyLoaded();
}, { immediate: true });
watch(() => state.value.phase, (phase) => {
    if (phase === 'done')
        emit('done');
});
const loggedIn = props.loggedIn ?? false;
const loginVisible = computed(() => (props.mode === 'landing' || props.mode === 'loop') && state.value.phase !== 'ended');
const idle = useIdleDim();
const dimmed = computed(() => idle.value && !state.value.paused);
const skipFresh = ref(false);
let skipFreshTimer;
watch(() => state.value.skipVisible, (visible) => {
    clearTimeout(skipFreshTimer);
    skipFresh.value = visible;
    if (visible)
        skipFreshTimer = setTimeout(() => (skipFresh.value = false), SKIP_FRESH_MS);
}, { immediate: true });
const pauseVisible = computed(() => state.value.phase === 'playing' || state.value.phase === 'exiting');
function togglePause() {
    if (state.value.paused)
        sequencer.resume();
    else
        sequencer.pause();
}
// ---- timeline
// Dragging the playhead pauses the run (and its voice); letting go resumes it if it was playing.
// A drag that starts paused stays paused after it, but its moves still must not re-enter the clip each time.
let pausedBeforeDrag = false;
function onDragStart() {
    pausedBeforeDrag = state.value.paused;
    scrubbing.value = true;
    sequencer.pause();
}
function onDragEnd() {
    if (!scrubbing.value)
        return;
    scrubbing.value = false;
    if (!pausedBeforeDrag)
        sequencer.resume();
}
/** What the player paused, not the pause a drag puts on the run. */
const pausedByPlayer = computed(() => state.value.paused && !(scrubbing.value && !pausedBeforeDrag));
const landing = props.mode === 'landing';
const gated = computed(() => landing && !props.loaded);
const barLocked = computed(() => landing && state.value.phase === 'exiting');
const loadRows = computed(() => {
    if (!landing)
        return [];
    const rows = [{ id: 'voices', ...voiceProgress.value, gating: true }];
    // terrain and buildings are listed from the start: a group that has not reported a page yet shows 0 of an unknown total
    for (const id of ['terrain', 'buildings']) {
        const count = introLoad[id] ?? { loaded: 0, total: 0 };
        rows.push({ id, loaded: count.loaded, total: count.total, gating: true });
    }
    if (introLoad.animations)
        rows.push({ id: 'animations', ...introLoad.animations, gating: false });
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
function startSaga(withSound) {
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
function sceneStart(beat) {
    const { chapters } = timeline;
    const index = chapters.findIndex((c) => c.id === beat);
    const scene = metaOf(beat).scene;
    if (index < 1 || !scene)
        return null;
    let first = index;
    while (first > 0 && metaOf(chapters[first - 1].id).scene === scene)
        first--;
    return first === index ? null : { first: chapters[first].id, lead: chapters[index].startMs - chapters[first].startMs };
}
const rootEl = useTemplateRef('root');
function layerAnimations(layer) {
    return typeof layer.getAnimations === 'function' ? layer.getAnimations({ subtree: true }) : [];
}
watch(() => state.value.seq, async () => {
    const sync = pendingSync;
    pendingSync = null;
    if (!sync)
        return;
    const layers = rootEl.value?.querySelectorAll('.beat-layer');
    const layer = layers?.[layers.length - 1];
    const finish = () => (sceneStage.value = null);
    if (!layer)
        return finish();
    for (const anim of layerAnimations(layer))
        anim.currentTime = sync.lead + sync.offset;
    if (!sync.twoStep)
        return;
    const before = new Set(layerAnimations(layer));
    finish();
    await nextTick();
    for (const anim of layerAnimations(layer))
        if (!before.has(anim))
            anim.currentTime = sync.offset;
}, { flush: 'post' });
// Esc closes the intro at once: no exit beat, no fade.
function close() {
    sequencer.close();
    emit('close');
}
function onLogin() {
    close();
    if (!loggedIn)
        introSignal.loginRequested = true;
}
// Space toggles pause; a focused button (or field) already handles space itself.
function onKeydown(event) {
    if (event.key === 'Escape') {
        if (!event.repeat && state.value.phase !== 'done')
            close();
        return;
    }
    if (event.code !== 'Space' || event.repeat || !pauseVisible.value)
        return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, textarea, select, [contenteditable]:not([contenteditable="false"])'))
        return;
    event.preventDefault();
    togglePause();
}
// A click or tap on the scene toggles pause like the button and space do; buttons and the control row keep their own action.
function onSceneClick(event) {
    if (!pauseVisible.value)
        return;
    // the path, not the target: a button that re-renders its icon on this very click has already replaced the target
    if (event.composedPath().some((node) => node instanceof Element && node.matches('button, .ctrl')))
        return;
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
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(state, {});
    __VLS_withDotValue(detailOpen, {});
    __VLS_withDotValue(voiceBeat, {});
    __VLS_withDotValue(instant, {});
    __VLS_withDotValue(meta, {});
    __VLS_withDotValue(BEAT_COMPONENTS, {});
    __VLS_withDotValue(showLanding, {});
    __VLS_withDotValue(isCall, {});
    __VLS_withDotValue(sequencer, {});
    __VLS_withDotValue(loginVisible, {});
    __VLS_withDotValue(loggedIn, {});
    __VLS_withDotValue(pauseVisible, {});
    __VLS_withDotValue(pausedByPlayer, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['narration']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['narration']} */ ;
    /** @type {__VLS_StyleScopedClasses['narration']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fading']} */ ;
    /** @type {__VLS_StyleScopedClasses['topright']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['login']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['ctrl']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['ctrl']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['login']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['login']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['howto']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['cplay']} */ ;
    /** @type {__VLS_StyleScopedClasses['cplay']} */ ;
    /** @type {__VLS_StyleScopedClasses['cplay']} */ ;
    /** @type {__VLS_StyleScopedClasses['cplay']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['cplay']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-cplay-enter-active']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-cplay-leave-active']} */ ;
    /** @type {__VLS_StyleScopedClasses['end']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    /** @type {__VLS_StyleScopedClasses['beat-layer']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-active']} */ ;
    /** @type {__VLS_StyleScopedClasses['beat-layer']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-active']} */ ;
    if (state.value.phase !== 'done') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (onSceneClick) },
            ...{ class: "landing-intro" },
            ref: "root",
            ...{ class: ({ 'is-fading': __VLS_unwrap(fadesOut, {}), 'is-paused': state.value.paused, 'is-idle': __VLS_unwrap(dimmed, {}), 'detail-open': detailOpen.value && pauseVisible.value, 'is-still': __VLS_ctx.reducedMotion }) },
            ...{ style: (__VLS_unwrap(rootStyle, {})) },
            role: "region",
            'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'region')),
            'data-testid': "landing-intro",
            'data-beat': (state.value.beat),
            'data-phase': (state.value.phase),
            'data-voice-beat': (voiceBeat.value ?? undefined),
            'data-voice-state': (__VLS_unwrap(voiceState, {})),
        });
        /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-fading']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-paused']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
        /** @type {__VLS_StyleScopedClasses['detail-open']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ class: "fog-defs" },
            width: "0",
            height: "0",
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['fog-defs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern, __VLS_intrinsics.pattern)({
            id: "intro-fog",
            patternUnits: "userSpaceOnUse",
            width: "256",
            height: "256",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.image)({
            href: (__VLS_unwrap(fogUrl, {})),
            width: "256",
            height: "256",
        });
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            name: "intro-fade", css: (!instant.value),
        }));
        const __VLS_2 = __VLS_1({
            name: "intro-fade",
            css: (!instant.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        var __VLS_3;
        const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (`${meta.value.scene ?? state.value.beat}:${state.value.round}`),
            ...{ class: "beat-layer" },
            ...{ style: (__VLS_unwrap(beatStyle, {})) },
        });
        /** @type {__VLS_StyleScopedClasses['beat-layer']} */ ;
        const __VLS_6 = (BEAT_COMPONENTS.value[__VLS_unwrap(shownBeat, {})]);
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
            // @ts-ignore
            paused: ((state.value.phase === 'waitingForPlay' && !showLanding.value) || state.value.paused), ...(showLanding.value ? { held: true } : {}),
        }));
        const __VLS_8 = __VLS_7({
            paused: ((state.value.phase === 'waitingForPlay' && !showLanding.value) || state.value.paused),
            ...(showLanding.value ? { held: true } : {}),
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        // @ts-ignore
        [state, state, state, state, state, state, state, state, fadesOut, dimmed, detailOpen, pauseVisible, reducedMotion, rootStyle, introText, locale, voiceBeat, voiceState, fogUrl, instant, meta, beatStyle, BEAT_COMPONENTS, shownBeat, showLanding, showLanding,];
        let __VLS_11;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
            // @ts-ignore
            name: (instant.value ? 'intro-instant' : isCall.value ? 'intro-call' : 'intro-fade'), mode: (isCall.value ? undefined : 'out-in'),
        }));
        const __VLS_13 = __VLS_12({
            name: (instant.value ? 'intro-instant' : isCall.value ? 'intro-call' : 'intro-fade'),
            mode: (isCall.value ? undefined : 'out-in'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        var __VLS_14;
        const { default: __VLS_16 } = __VLS_nonNull(__VLS_14.slots);
        if (state.value.phase !== 'ended' && !showLanding.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                key: (state.value.beat),
                ...{ class: "narration" },
                ...{ class: ({ 'is-call': isCall.value }) },
                'aria-live': "polite",
                'data-testid': "intro-narration",
            });
            /** @type {__VLS_StyleScopedClasses['narration']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-call']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'beats.' + state.value.beat));
        }
        // @ts-ignore
        [state, state, state, introText, locale, instant, showLanding, isCall, isCall, isCall,];
        let __VLS_17;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_19 = __VLS_18({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        var __VLS_20;
        const { default: __VLS_22 } = __VLS_nonNull(__VLS_20.slots);
        if (showLanding.value) {
            const __VLS_23 = LandingPage;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
                // @ts-ignore
                ...{ 'onHear': {} }, ...{ 'onMuted': {} }, ...{ 'onMap': {} }, locale: (__VLS_ctx.locale), loadFraction: (__VLS_unwrap(mapFraction, {})),
            }));
            const __VLS_25 = __VLS_24({
                ...{ 'onHear': {} },
                ...{ 'onMuted': {} },
                ...{ 'onMap': {} },
                locale: (__VLS_ctx.locale),
                loadFraction: (__VLS_unwrap(mapFraction, {})),
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            let __VLS_28;
            const __VLS_29 = {
                /** @type {typeof __VLS_28.hear} */
                onHear: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(showLanding.value))
                        throw 0;
                    return (startSaga(true));
                    // @ts-ignore
                    [locale, showLanding, mapFraction,];
                },
            };
            void __VLS_29;
            const __VLS_30 = {
                /** @type {typeof __VLS_28.muted} */
                onMuted: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(showLanding.value))
                        throw 0;
                    return (startSaga(false));
                    // @ts-ignore
                    [];
                },
            };
            void __VLS_30;
            const __VLS_31 = {
                /** @type {typeof __VLS_28.map} */
                onMap: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(showLanding.value))
                        throw 0;
                    return (close());
                    // @ts-ignore
                    [];
                },
            };
            void __VLS_31;
            var __VLS_26;
            var __VLS_27;
        }
        // @ts-ignore
        [];
        let __VLS_32;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_34 = __VLS_33({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        var __VLS_35;
        const { default: __VLS_37 } = __VLS_nonNull(__VLS_35.slots);
        if (state.value.phase === 'waitingForPlay' && !showLanding.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(state.value.phase === 'waitingForPlay' && !showLanding.value))
                            throw 0;
                        return (sequencer.value.play());
                        // @ts-ignore
                        [state, showLanding, sequencer,];
                    } },
                type: "button",
                ...{ class: "intro-btn play" },
                'data-testid': "intro-play",
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['play']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'play'));
        }
        // @ts-ignore
        [introText, locale,];
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "topright" },
        });
        /** @type {__VLS_StyleScopedClasses['topright']} */ ;
        let __VLS_38;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_40 = __VLS_39({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
        var __VLS_41;
        const { default: __VLS_43 } = __VLS_nonNull(__VLS_41.slots);
        if (showLanding.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
                ...{ class: "howto" },
                href: "/docs",
                'data-testid': "landing-how-to-play",
            });
            /** @type {__VLS_StyleScopedClasses['howto']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                width: "18",
                height: "18",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "1.6",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M12 6v14",
            });
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'howToPlay'));
        }
        // @ts-ignore
        [introText, locale, showLanding,];
        let __VLS_44;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_46 = __VLS_45({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        var __VLS_47;
        const { default: __VLS_49 } = __VLS_nonNull(__VLS_47.slots);
        if (loginVisible.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(loginVisible.value))
                            throw 0;
                        return (onLogin());
                        // @ts-ignore
                        [loginVisible,];
                    } },
                type: "button",
                ...{ class: "intro-btn login" },
                'data-testid': "intro-login",
                'data-login-state': (loggedIn.value ? 'enter' : 'login'),
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['login']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, loggedIn.value ? 'enterWorld' : 'login'));
        }
        // @ts-ignore
        [introText, locale, loggedIn, loggedIn,];
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "actions" },
        });
        /** @type {__VLS_StyleScopedClasses['actions']} */ ;
        let __VLS_50;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_52 = __VLS_51({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_51));
        var __VLS_53;
        const { default: __VLS_55 } = __VLS_nonNull(__VLS_53.slots);
        if (state.value.skipVisible) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(state.value.skipVisible))
                            throw 0;
                        return (sequencer.value.skip());
                        // @ts-ignore
                        [state, sequencer,];
                    } },
                type: "button",
                ...{ class: "intro-btn skip" },
                ...{ class: ({ 'is-fresh': __VLS_unwrap(skipFresh, {}) }) },
                'data-testid': "intro-skip",
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['skip']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-fresh']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'skip'));
        }
        // @ts-ignore
        [introText, locale, skipFresh,];
        let __VLS_56;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
            // @ts-ignore
            name: "intro-cplay",
        }));
        const __VLS_58 = __VLS_57({
            name: "intro-cplay",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        var __VLS_59;
        const { default: __VLS_61 } = __VLS_nonNull(__VLS_59.slots);
        if (pauseVisible.value && pausedByPlayer.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(pauseVisible.value && pausedByPlayer.value))
                            throw 0;
                        return (togglePause());
                        // @ts-ignore
                        [pauseVisible, pausedByPlayer,];
                    } },
                type: "button",
                ...{ class: "cplay" },
                'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'resume')),
                'data-testid': "intro-center-play",
            });
            /** @type {__VLS_StyleScopedClasses['cplay']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                viewBox: "0 0 24 24",
                width: "72",
                height: "72",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M8 5.6v12.8a1.2 1.2 0 0 0 1.8 1l10.2-6.4a1.2 1.2 0 0 0 0-2L9.8 4.6A1.2 1.2 0 0 0 8 5.6z",
                fill: "currentColor",
                stroke: "currentColor",
                'stroke-width': "2.2",
                'stroke-linejoin': "round",
            });
        }
        // @ts-ignore
        [introText, locale,];
        let __VLS_62;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_64 = __VLS_63({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        var __VLS_65;
        const { default: __VLS_67 } = __VLS_nonNull(__VLS_65.slots);
        if (pauseVisible.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "ctrl-scrim" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['ctrl-scrim']} */ ;
        }
        // @ts-ignore
        [pauseVisible,];
        let __VLS_68;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent1(__VLS_68, new __VLS_68({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_70 = __VLS_69({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        var __VLS_71;
        const { default: __VLS_73 } = __VLS_nonNull(__VLS_71.slots);
        if (pauseVisible.value) {
            const __VLS_74 = IntroTimeline;
            // @ts-ignore
            const __VLS_75 = __VLS_asFunctionalComponent1(__VLS_74, new __VLS_74({
                // @ts-ignore
                ...{ 'onSeek': {} }, ...{ 'onDragStart': {} }, ...{ 'onDragEnd': {} }, ...{ 'onTogglePause': {} }, ...{ 'onSound': {} }, ...{ 'onVolume': {} }, ...{ 'onDetailOpen': {} }, timeline: (__VLS_unwrap(timeline, {})), state: (state.value), getPosition: (() => sequencer.value.positionMs()), locale: (__VLS_ctx.locale), paused: (pausedByPlayer.value), gated: (__VLS_unwrap(gated, {})), locked: (__VLS_unwrap(barLocked, {})), loadFraction: (__VLS_unwrap(loadFraction, {})), loadRows: (__VLS_unwrap(detailRows, {})), sound: (__VLS_unwrap(sound, {})), volume: (__VLS_unwrap(volume, {})), reducedMotion: (__VLS_ctx.reducedMotion),
            }));
            const __VLS_76 = __VLS_75({
                ...{ 'onSeek': {} },
                ...{ 'onDragStart': {} },
                ...{ 'onDragEnd': {} },
                ...{ 'onTogglePause': {} },
                ...{ 'onSound': {} },
                ...{ 'onVolume': {} },
                ...{ 'onDetailOpen': {} },
                timeline: (__VLS_unwrap(timeline, {})),
                state: (state.value),
                getPosition: (() => sequencer.value.positionMs()),
                locale: (__VLS_ctx.locale),
                paused: (pausedByPlayer.value),
                gated: (__VLS_unwrap(gated, {})),
                locked: (__VLS_unwrap(barLocked, {})),
                loadFraction: (__VLS_unwrap(loadFraction, {})),
                loadRows: (__VLS_unwrap(detailRows, {})),
                sound: (__VLS_unwrap(sound, {})),
                volume: (__VLS_unwrap(volume, {})),
                reducedMotion: (__VLS_ctx.reducedMotion),
            }, ...__VLS_functionalComponentArgsRest(__VLS_75));
            let __VLS_79;
            const __VLS_80 = {
                /** @type {typeof __VLS_79.seek} */
                onSeek: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(pauseVisible.value))
                        throw 0;
                    return (sequencer.value.seek($event));
                    // @ts-ignore
                    [state, pauseVisible, reducedMotion, locale, sequencer, sequencer, pausedByPlayer, timeline, gated, barLocked, loadFraction, detailRows, sound, volume,];
                },
            };
            void __VLS_80;
            const __VLS_81 = {
                /** @type {typeof __VLS_79.dragStart} */
                onDragStart: (onDragStart),
            };
            void __VLS_81;
            const __VLS_82 = {
                /** @type {typeof __VLS_79.dragEnd} */
                onDragEnd: (onDragEnd),
            };
            void __VLS_82;
            const __VLS_83 = {
                /** @type {typeof __VLS_79.togglePause} */
                onTogglePause: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(pauseVisible.value))
                        throw 0;
                    return (togglePause());
                    // @ts-ignore
                    [];
                },
            };
            void __VLS_83;
            const __VLS_84 = {
                /** @type {typeof __VLS_79.sound} */
                onSound: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(pauseVisible.value))
                        throw 0;
                    return (toggleSound());
                    // @ts-ignore
                    [];
                },
            };
            void __VLS_84;
            const __VLS_85 = {
                /** @type {typeof __VLS_79.volume} */
                onVolume: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(pauseVisible.value))
                        throw 0;
                    return (setVolume($event));
                    // @ts-ignore
                    [];
                },
            };
            void __VLS_85;
            const __VLS_86 = {
                /** @type {typeof __VLS_79.detailOpen} */
                onDetailOpen: (...[$event]) => {
                    void $event;
                    if (!(state.value.phase !== 'done'))
                        throw 0;
                    if (!(pauseVisible.value))
                        throw 0;
                    return (detailOpen.value = $event);
                    // @ts-ignore
                    [detailOpen,];
                },
            };
            void __VLS_86;
            var __VLS_77;
            var __VLS_78;
        }
        // @ts-ignore
        [];
        let __VLS_87;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_89 = __VLS_88({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        var __VLS_90;
        const { default: __VLS_92 } = __VLS_nonNull(__VLS_90.slots);
        if (state.value.phase === 'ended') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "end" },
                'data-testid': "intro-end",
            });
            /** @type {__VLS_StyleScopedClasses['end']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(state.value.phase === 'ended'))
                            throw 0;
                        return (__VLS_unwrap(emit, {})('back-to-docs'));
                        // @ts-ignore
                        [state, emit,];
                    } },
                type: "button",
                ...{ class: "intro-btn dark" },
                'data-testid': "intro-back-to-docs",
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['dark']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'backToDocs'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(state.value.phase === 'ended'))
                            throw 0;
                        return (__VLS_unwrap(emit, {})('enter-game'));
                        // @ts-ignore
                        [introText, locale, emit,];
                    } },
                type: "button",
                ...{ class: "intro-btn dark primary" },
                'data-testid': "intro-enter-game",
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['dark']} */ ;
            /** @type {__VLS_StyleScopedClasses['primary']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'enterGame'));
        }
        // @ts-ignore
        [introText, locale,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
