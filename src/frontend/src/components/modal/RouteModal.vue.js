/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Reusable dialog chrome for every modal-route page (see lib/modalRoute.ts
// and App.vue's own comment on the background-route pattern this sits on
// top of): backdrop, close/back button, desktop vs. mobile layout, focus
// handling, and the close() = history-back-if-we-came-from-a-backgroundView-
// else-replace logic. Originally ProfileModal.vue's own template/script;
// extracted so LeaderboardModal.vue/GuildModal.vue can reuse the exact same
// chrome instead of copy-pasting it. The caller supplies the actual content
// via the default slot and a `title` (used verbatim on mobile's header bar,
// and as the panel's aria-label).
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { useCoversMap } from '../../composables/useMapCover';
import { MOBILE_MODAL_QUERY } from '../../lib/breakpoints';
const { defineProps, defineExpose, } = {};
const props = defineProps();
const router = useRouter();
const { t } = useI18n({ useScope: 'global' });
const isMobile = useMediaQuery(MOBILE_MODAL_QUERY);
// The mobile panel fills the screen opaque, so the map behind it is hidden;
// the desktop panel floats over a translucent backdrop with the map visible.
useCoversMap(isMobile);
const panelEl = ref(null);
// Closing: if we got here from an in-app navigation (history.state.
// backgroundView set, and it's genuinely the page we came from — history.
// state.back matches it), going back lands exactly where the player was,
// scroll position and all. Otherwise (direct load, reload, a link opened in
// a new tab) there is nothing to go "back" to, so replace with the
// background view instead of leaving a stray modal-route entry in history.
function close() {
    // Via the router's own history object, not the global `window.history` —
    // works the same way against a `createMemoryHistory` router in tests. See
    // lib/modalRoute.ts's own comment.
    const state = router.options.history.state;
    const backgroundView = typeof state.backgroundView === 'string' ? state.backgroundView : null;
    if (backgroundView && state.back === backgroundView) {
        router.back();
    }
    else {
        router.replace(backgroundView ?? '/settlement');
    }
}
const __VLS_exposed = { close };
defineExpose(__VLS_exposed);
// Focus the dialog on open, both for a11y (focus moves into the modal, same
// as any other dialog in this app) and so a bare Escape press — with focus
// not sitting inside some nested dialog the content renders — reaches this
// panel's own keydown handler below rather than doing nothing.
onMounted(() => {
    void nextTick(() => panelEl.value?.focus());
});
// A nested dialog the slotted content renders (e.g. ProfileView's report
// dialog) owns its own Escape handling (`@keydown.esc.stop`) and, being the
// deeper element, runs first and stops the event from bubbling here while
// it's open — so this only ever fires when no such nested dialog is open.
function onKeydown(e) {
    if (e.key === 'Escape')
        close();
}
const handleBack = computed(() => props.onBack ?? close);
const backLabel = computed(() => t('profile.back'));
const backChevron = computed(() => t('profile.backChevron'));
const closeLabel = computed(() => t('profile.close'));
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(isMobile, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['close-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['modal-panel--mobile']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (close) },
        ...{ class: "modal-backdrop" },
        ...{ class: ({ 'modal-backdrop--mobile': isMobile.value }) },
    });
    /** @type {__VLS_StyleScopedClasses['modal-backdrop']} */ ;
    /** @type {__VLS_StyleScopedClasses['modal-backdrop--mobile']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onKeydown: (onKeydown) },
        ref: "panelEl",
        ...{ class: "modal-panel" },
        ...{ class: ({ 'modal-panel--mobile': isMobile.value }) },
        role: "dialog",
        'aria-modal': "true",
        'aria-label': (props.title || undefined),
        'data-testid': (props.testid),
        tabindex: "-1",
    });
    /** @type {__VLS_StyleScopedClasses['modal-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['modal-panel--mobile']} */ ;
    if (isMobile.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "mobile-header" },
        });
        /** @type {__VLS_StyleScopedClasses['mobile-header']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (__VLS_unwrap(handleBack, {})) },
            type: "button",
            ...{ class: "back-button" },
            'aria-label': (__VLS_unwrap(backLabel, {})),
        });
        /** @type {__VLS_StyleScopedClasses['back-button']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            'aria-hidden': "true",
        });
        (__VLS_unwrap(backChevron, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "mobile-title" },
        });
        /** @type {__VLS_StyleScopedClasses['mobile-title']} */ ;
        (props.title);
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (close) },
            type: "button",
            ...{ class: "close-button" },
            'aria-label': (__VLS_unwrap(closeLabel, {})),
        });
        /** @type {__VLS_StyleScopedClasses['close-button']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            'aria-hidden': "true",
        });
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal-content" },
    });
    /** @type {__VLS_StyleScopedClasses['modal-content']} */ ;
    var __VLS_0 = {};
    var __VLS_1 = __VLS_0;
    // @ts-ignore
    [isMobile, isMobile, isMobile, handleBack, backLabel, backChevron, closeLabel,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeProps: {},
});
const __VLS_export = {};
export default {};
