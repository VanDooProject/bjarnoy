/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue';
import './introFog.css';
import './introButton.css';
import { BEATS, BEAT_COMPONENTS } from './beats/registry';
import { introFogUrl } from './fogTexture';
import { introText } from './introText';
import { beatsFor, holdMinMs, IntroVoice } from './introVoice';
import { INTRO_BEAT, INTRO_BEAT_MS } from './beats/types';
import { IntroSequencer } from './sequencer';
import { introSignal } from './introSignal';
import { useIdleDim } from './useIdleDim';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const FADE_OUT_MS = 1000;
// The skip button stays at full strength this long after it appears, so it is noticed before it dims.
const SKIP_FRESH_MS = 3000;
const fogUrl = introFogUrl();
// Each intro beat lasts as long as its voice clip in the player's language (plus a tail).
const beats = beatsFor(props.locale, BEATS);
const exitMeta = beats.find((b) => b.role === 'exit');
const state = shallowRef({ phase: 'waitingForPlay', beat: beats[0].id, cycle: 0, round: 0, skipVisible: false, paused: false });
const sequencer = new IntroSequencer({
    beats,
    mode: props.mode,
    loopBeats: props.loopBeats,
    reducedMotion: props.reducedMotion,
    playNow: props.playNow,
    // the hold lasts at least as long as its voice clip (plus the tail)
    holdMinMs: holdMinMs(props.locale),
    onChange: (s) => (state.value = s),
});
state.value = sequencer.state;
const meta = computed(() => beats.find((b) => b.id === state.value.beat));
provide(INTRO_BEAT, computed(() => state.value.beat));
provide(INTRO_BEAT_MS, (id) => beats.find((b) => b.id === id).durationMs);
// The voice loads its clips now, before the map tiles; each clip starts with its beat (muted while the sound is off).
const sound = ref(props.soundOn);
const voiceBeat = ref(null);
const voiceState = ref('stopped');
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
let voicedKey = null;
watch(() => [state.value.phase, state.value.beat, state.value.round, state.value.paused], ([phase, beat, round, paused]) => {
    if (phase === 'done' || phase === 'ended') {
        voice.stop();
        voicedKey = null;
        return;
    }
    if (phase === 'waitingForPlay')
        return;
    const key = `${beat}:${round}`;
    if (key !== voicedKey) {
        voicedKey = key;
        voice.enterBeat(beat);
    }
    if (paused)
        voice.pause();
    else
        voice.resume();
}, { immediate: true });
function toggleSound() {
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
// A click or tap on the scene toggles pause like the button and space do; buttons keep their own action.
function onSceneClick(event) {
    if (!pauseVisible.value)
        return;
    if (event.target instanceof Element && event.target.closest('button'))
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
    __VLS_withDotValue(voiceBeat, {});
    __VLS_withDotValue(meta, {});
    __VLS_withDotValue(BEAT_COMPONENTS, {});
    __VLS_withDotValue(isCall, {});
    __VLS_withDotValue(sequencer, {});
    __VLS_withDotValue(loginVisible, {});
    __VLS_withDotValue(loggedIn, {});
    __VLS_withDotValue(pauseVisible, {});
    __VLS_withDotValue(sound, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['narration']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fading']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['landing-intro']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-idle']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['login']} */ ;
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
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['sound']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['sound']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['end']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-enter-from']} */ ;
    /** @type {__VLS_StyleScopedClasses['intro-fade-leave-to']} */ ;
    if (state.value.phase !== 'done') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (onSceneClick) },
            ...{ class: "landing-intro" },
            ...{ class: ({ 'is-fading': __VLS_unwrap(fadesOut, {}), 'is-paused': state.value.paused, 'is-idle': __VLS_unwrap(dimmed, {}) }) },
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
            name: "intro-fade",
        }));
        const __VLS_2 = __VLS_1({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        var __VLS_3;
        const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (`${meta.value.scene ?? state.value.beat}:${state.value.round}`),
            ...{ class: "beat-layer" },
            ...{ style: (__VLS_unwrap(beatStyle, {})) },
        });
        /** @type {__VLS_StyleScopedClasses['beat-layer']} */ ;
        const __VLS_6 = (BEAT_COMPONENTS.value[state.value.beat]);
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
            // @ts-ignore
            paused: (state.value.phase === 'waitingForPlay' || state.value.paused),
        }));
        const __VLS_8 = __VLS_7({
            paused: (state.value.phase === 'waitingForPlay' || state.value.paused),
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        // @ts-ignore
        [state, state, state, state, state, state, state, state, state, fadesOut, dimmed, rootStyle, introText, locale, voiceBeat, voiceState, fogUrl, meta, beatStyle, BEAT_COMPONENTS,];
        let __VLS_11;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
            // @ts-ignore
            name: (isCall.value ? 'intro-call' : 'intro-fade'), mode: (isCall.value ? undefined : 'out-in'),
        }));
        const __VLS_13 = __VLS_12({
            name: (isCall.value ? 'intro-call' : 'intro-fade'),
            mode: (isCall.value ? undefined : 'out-in'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        var __VLS_14;
        const { default: __VLS_16 } = __VLS_nonNull(__VLS_14.slots);
        if (state.value.phase !== 'ended') {
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
        [state, state, state, introText, locale, isCall, isCall, isCall,];
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
        if (state.value.phase === 'waitingForPlay') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(state.value.phase === 'waitingForPlay'))
                            throw 0;
                        return (sequencer.value.play());
                        // @ts-ignore
                        [state, sequencer,];
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
        let __VLS_23;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_25 = __VLS_24({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        var __VLS_26;
        const { default: __VLS_28 } = __VLS_nonNull(__VLS_26.slots);
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
        let __VLS_29;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_31 = __VLS_30({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
        var __VLS_32;
        const { default: __VLS_34 } = __VLS_nonNull(__VLS_32.slots);
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
        let __VLS_35;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_37 = __VLS_36({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
        var __VLS_38;
        const { default: __VLS_40 } = __VLS_nonNull(__VLS_38.slots);
        if (pauseVisible.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(pauseVisible.value))
                            throw 0;
                        return (sequencer.value.restart());
                        // @ts-ignore
                        [sequencer, pauseVisible,];
                    } },
                type: "button",
                ...{ class: "intro-btn icon restart" },
                'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, 'restart')),
                'data-testid': "intro-restart",
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['icon']} */ ;
            /** @type {__VLS_StyleScopedClasses['restart']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                'aria-hidden': "true",
            });
        }
        // @ts-ignore
        [introText, locale,];
        let __VLS_41;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_43 = __VLS_42({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        var __VLS_44;
        const { default: __VLS_46 } = __VLS_nonNull(__VLS_44.slots);
        if (pauseVisible.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(pauseVisible.value))
                            throw 0;
                        return (togglePause());
                        // @ts-ignore
                        [pauseVisible,];
                    } },
                type: "button",
                ...{ class: "intro-btn pause" },
                'aria-pressed': (state.value.paused),
                'data-testid': "intro-pause",
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['pause']} */ ;
            (__VLS_unwrap(introText, {})(__VLS_ctx.locale, state.value.paused ? 'resume' : 'pause'));
        }
        // @ts-ignore
        [state, state, introText, locale,];
        let __VLS_47;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_49 = __VLS_48({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_48));
        var __VLS_50;
        const { default: __VLS_52 } = __VLS_nonNull(__VLS_50.slots);
        if (pauseVisible.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(state.value.phase !== 'done'))
                            throw 0;
                        if (!(pauseVisible.value))
                            throw 0;
                        return (toggleSound());
                        // @ts-ignore
                        [pauseVisible,];
                    } },
                type: "button",
                ...{ class: "intro-btn sound" },
                ...{ class: ({ 'is-muted': !sound.value, 'is-still': __VLS_ctx.reducedMotion }) },
                'aria-label': (__VLS_unwrap(introText, {})(__VLS_ctx.locale, sound.value ? 'soundOff' : 'soundOn')),
                'aria-pressed': (sound.value),
                'data-testid': "intro-sound",
                'data-sound': (sound.value ? 'on' : 'off'),
            });
            /** @type {__VLS_StyleScopedClasses['intro-btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['sound']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-muted']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-still']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
                viewBox: "0 0 24 24",
                width: "24",
                height: "24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "2",
                'stroke-linecap': "round",
                'stroke-linejoin': "round",
                'aria-hidden': "true",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z",
                fill: "currentColor",
            });
            if (sound.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M15.5 9.5a3.5 3.5 0 0 1 0 5",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M18 7a7 7 0 0 1 0 10",
                });
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M16 9.5l5 5M21 9.5l-5 5",
                });
            }
        }
        // @ts-ignore
        [introText, locale, sound, sound, sound, sound, sound, reducedMotion,];
        let __VLS_53;
        /** @ts-ignore @type { | typeof __VLS_components.Transition | typeof __VLS_components.Transition} */
        Transition;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
            // @ts-ignore
            name: "intro-fade",
        }));
        const __VLS_55 = __VLS_54({
            name: "intro-fade",
        }, ...__VLS_functionalComponentArgsRest(__VLS_54));
        var __VLS_56;
        const { default: __VLS_58 } = __VLS_nonNull(__VLS_56.slots);
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
