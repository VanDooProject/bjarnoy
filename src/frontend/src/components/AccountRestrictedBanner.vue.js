/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Shown whenever any API call comes back 403 { error: "user_locked" } — see
// `authHooks.onAccountLocked` in stores/auth.ts, set from api/client.ts's
// request(). Deliberately minimal: a persistent strip, not a modal — a
// locked account can still look around, it just can't act.
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
const auth = useAuthStore();
const { t } = useI18n({ useScope: 'global' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(auth, {});
    void {};
    if (auth.value.accountLocked) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "banner" },
        });
        /** @type {__VLS_StyleScopedClasses['banner']} */ ;
        (__VLS_unwrap(t, {})('accountRestrictedBanner.message'));
    }
    // @ts-ignore
    [auth, t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
