/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The battle-reports inbox (list and detail) as a modal over whatever page
// was showing before — see lib/modalRoute.ts and App.vue's own comment on
// the background-route pattern this sits on top of, and profile/
// ProfileModal.vue for the sibling this mirrors. ReportsView.vue keeps all
// of the actual reports logic (data loading, the kind filter, the list/
// detail split); this component only wires it into RouteModal.vue's shared
// dialog chrome.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import ReportsView from '../../views/ReportsView.vue';
const { t } = useI18n({ useScope: 'global' });
const reportsViewRef = ref(null);
// Mobile header: the list's own title until a detail is open, then a short
// label for whichever report that is (mission/"Trade") — both exposed by
// ReportsView rather than recomputed here.
const modalTitle = computed(() => reportsViewRef.value?.detailTitle ?? t('reports.title'));
// On a detail, the mobile chevron goes up one level to the list
// (ReportsView's own backToList — it knows whether that's `router.back()`
// or a `replace`). On the list itself there's nowhere "up" to go, so it
// falls through to RouteModal's default: close the whole modal, same as
// the desktop × button.
const handleBack = computed(() => (reportsViewRef.value?.isDetail ? reportsViewRef.value.backToList : undefined));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    const __VLS_0 = RouteModal || RouteModal;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        title: (__VLS_unwrap(modalTitle, {})), testid: "reports-modal", onBack: (__VLS_unwrap(handleBack, {})),
    }));
    const __VLS_2 = __VLS_1({
        title: (__VLS_unwrap(modalTitle, {})),
        testid: "reports-modal",
        onBack: (__VLS_unwrap(handleBack, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = ReportsView;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        ref: "reportsViewRef",
    }));
    const __VLS_8 = __VLS_7({
        ref: "reportsViewRef",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    // @ts-ignore
    [modalTitle, handleBack,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
