/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The battle-reports inbox as a modal over whatever page
// was showing before — see lib/modalRoute.ts and App.vue's own comment on
// the background-route pattern this sits on top of, and profile/
// ProfileModal.vue for the sibling this mirrors. ReportsView.vue keeps all
// of the actual reports logic (data loading, the kind filter, which rows are
// open); this component only wires it into RouteModal.vue's shared
// dialog chrome.
import RouteModal from '../modal/RouteModal.vue';
import ReportsView from '../../views/ReportsView.vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n({ useScope: 'global' });
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
        title: (__VLS_unwrap(t, {})('reports.title')), testid: "reports-modal",
    }));
    const __VLS_2 = __VLS_1({
        title: (__VLS_unwrap(t, {})('reports.title')),
        testid: "reports-modal",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = ReportsView;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    // @ts-ignore
    }));
    const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    // @ts-ignore
    [t,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
