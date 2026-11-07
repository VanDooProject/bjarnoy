/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The profile (own or someone else's) as a modal over whatever page was
// showing before — see lib/modalRoute.ts and App.vue's own comment on the
// background-route pattern this sits on top of. ProfileView.vue keeps all of
// the actual profile logic (data loading, bio editing, the report dialog,
// and — on the viewer's own profile — the Profile/Settings tabs); the
// dialog chrome (backdrop, close/back button, desktop/mobile layout) lives
// in RouteModal.vue, shared with LeaderboardModal.vue/GuildModal.vue.
import { computed, ref } from 'vue';
import RouteModal from '../modal/RouteModal.vue';
import ProfileView from '../../views/ProfileView.vue';
const profileViewRef = ref(null);
// Mobile's header bar shows the profile's own name once it has loaded —
// exposed by ProfileView rather than fetched again here.
const modalTitle = computed(() => profileViewRef.value?.profile?.displayName || profileViewRef.value?.profile?.userName || '');
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
        title: (__VLS_unwrap(modalTitle, {})),
    }));
    const __VLS_2 = __VLS_1({
        title: (__VLS_unwrap(modalTitle, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = ProfileView;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        ref: "profileViewRef",
    }));
    const __VLS_8 = __VLS_7({
        ref: "profileViewRef",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    // @ts-ignore
    [modalTitle,];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
