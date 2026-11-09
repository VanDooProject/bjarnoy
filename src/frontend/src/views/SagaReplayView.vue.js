/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { BEATS } from '../intro/beats/registry';
import LandingIntro from '../intro/LandingIntro.vue';
import { parseLoopAnchor } from '../intro/loopAnchor';
import { motionPreferences } from '../lib/perf/motionPreferences';
// The intro again, from the saga docs page. The same component the landing page plays; it ends on a choice
// between the docs and the game, and this view navigates.
const { locale } = useI18n({ useScope: 'global' });
const router = useRouter();
// `#loop` / `#loop(1-2,5)` plays the intro without end instead of the replay (read once, like the intro's other inputs)
const loopBeats = parseLoopAnchor(useRoute().hash, BEATS);
const toDocs = () => router.push('/docs/saga');
const introLocale = computed(() => (locale.value === 'de' ? 'de' : 'en'));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loopBeats, {});
    __VLS_withDotValue(motionPreferences, {});
    __VLS_withDotValue(router, {});
    const __VLS_0 = LandingIntro;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ 'onBackToDocs': {} }, ...{ 'onClose': {} }, ...{ 'onEnterGame': {} }, mode: (loopBeats.value ? 'loop' : 'replay'), loopBeats: (loopBeats.value ?? undefined), locale: (__VLS_unwrap(introLocale, {})), reducedMotion: (!motionPreferences.value.hudEnabled), loaded: (false), soundOn: (!loopBeats.value),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onBackToDocs': {} },
        ...{ 'onClose': {} },
        ...{ 'onEnterGame': {} },
        mode: (loopBeats.value ? 'loop' : 'replay'),
        loopBeats: (loopBeats.value ?? undefined),
        locale: (__VLS_unwrap(introLocale, {})),
        reducedMotion: (!motionPreferences.value.hudEnabled),
        loaded: (false),
        soundOn: (!loopBeats.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.backToDocs} */
        onBackToDocs: (__VLS_unwrap(toDocs, {})),
    };
    void __VLS_6;
    const __VLS_7 = {
        /** @type {typeof __VLS_5.close} */
        onClose: (__VLS_unwrap(toDocs, {})),
    };
    void __VLS_7;
    const __VLS_8 = {
        /** @type {typeof __VLS_5.enterGame} */
        onEnterGame: (...[$event]) => {
            void $event;
            return (router.value.push('/'));
            // @ts-ignore
            [loopBeats, loopBeats, loopBeats, introLocale, motionPreferences, toDocs, toDocs, router,];
        },
    };
    void __VLS_8;
    var __VLS_3;
    var __VLS_4;
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
