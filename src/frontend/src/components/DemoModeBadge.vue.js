/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Demo mode only ever runs on a developer's own machine (the deployed build
// talks to the API), so it is a small tag tucked in the bottom-left corner
// at every width, never a banner competing with the HUD for the top rows:
// a top-centre banner on desktop covered the middle resource pills. Desktop
// spells out "Demo mode — progress isn't saved", a phone just "Demo" (the
// full sentence stays in its `title`). It sits just above a bottom-docked
// bar, and hides while the phone's pull-down drawer is open.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEMO_MODE } from '../config';
import { useMediaQuery } from '../composables/useMediaQuery';
import { isHudDrawerOpen } from '../composables/hudDrawerOpenState';
import { isHudBarAtBottom, isHudBarMounted } from '../composables/hudSettlementBubbleState';
import { hudBarHeightPx } from '../composables/hudBarHeight';
import { HUD_COMPACT_QUERY } from '../lib/breakpoints';
const { t } = useI18n({ useScope: 'global' });
const isCompact = useMediaQuery(HUD_COMPACT_QUERY);
const badgeStyle = computed(() => {
    const barBelow = isHudBarMounted.value && isHudBarAtBottom.value ? hudBarHeightPx.value : 0;
    return { bottom: `calc(${barBelow + 2}px + env(safe-area-inset-bottom, 0px))` };
});
const showBadge = computed(() => DEMO_MODE && !(isCompact.value && isHudDrawerOpen.value));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(showBadge, {});
    __VLS_withDotValue(isCompact, {});
    void {};
    if (showBadge.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "demo-badge" },
            ...{ style: (__VLS_unwrap(badgeStyle, {})) },
            title: (__VLS_unwrap(t, {})('demoModeBadge.title')),
        });
        /** @type {__VLS_StyleScopedClasses['demo-badge']} */ ;
        (isCompact.value ? __VLS_unwrap(t, {})('demoModeBadge.short') : __VLS_unwrap(t, {})('demoModeBadge.label'));
    }
    // @ts-ignore
    [showBadge, badgeStyle, t, t, t, isCompact,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
