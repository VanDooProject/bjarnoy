/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Player logout/login gate: shown in place of the founding hero
// (LandingView.vue) when this device remembers an account
// (`player.lastAccount`, set by `forgetLocalIdentity` on logout) but the
// visitor is currently anonymous and hasn't founded anything yet — logging
// out drops the local identity that let them found without an account, so
// simply landing back on the founding hero would let them start a brand new
// (throwaway) realm without ever noticing their real one is still there.
// Submitting reuses the same shared login logic LoginView.vue uses
// (useLoginForm) so 403/401 handling and post-login realm restoration stay
// in one place.
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '../../stores/player';
import { useLoginForm } from '../../composables/useLoginForm';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
const player = usePlayerStore();
const router = useRouter();
const { t } = useI18n({ useScope: 'global' });
const { userName, password, submitting, error, login, restoreRealmIfAny } = useLoginForm();
// Prefilled from `lastAccount` but still editable — the device might be
// shared, or the visitor might actually want a different account's login
// form rather than the one this browser last remembered.
userName.value = player.lastAccount ?? '';
// The prefilled account name alone is not input worth keeping.
useUnsavedInput(() => password.value !== '' || userName.value !== (player.lastAccount ?? ''));
async function onSubmit() {
    if (!(await login(userName.value, password.value)))
        return;
    await restoreRealmIfAny();
    // Straight to the settlement, not `router.push('/')`: this panel already
    // lives on '/', and vue-router treats a push to the current location as a
    // duplicate navigation that never re-runs the guard (router/index.ts) that
    // would otherwise forward a founded player to /settlement — so the player
    // stayed on the landing page after a successful login. No realm restored
    // (demo mode, or an account with no realm in this world) means there's
    // nowhere else to go: the gate simply disappears and founding shows.
    if (player.hasFoundedSettlement) {
        await router.push({ name: 'settlement' });
    }
}
// "Start a new realm instead": declines the gate — forgetting `lastAccount`
// makes this panel stop showing (LandingView's own gate condition), so the
// normal founding hero reappears underneath.
function startNewRealm() {
    player.forgetLastAccount();
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(player, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(submitting, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    /** @type {__VLS_StyleScopedClasses['submit']} */ ;
    /** @type {__VLS_StyleScopedClasses['new-realm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "returning-login" },
        'data-testid': "returning-login-panel",
    });
    /** @type {__VLS_StyleScopedClasses['returning-login']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    (__VLS_unwrap(t, {})('onboarding.returningLogin.eyebrow'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_unwrap(t, {})('onboarding.returningLogin.title', { name: player.value.lastAccount }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "lede" },
    });
    /** @type {__VLS_StyleScopedClasses['lede']} */ ;
    (__VLS_unwrap(t, {})('onboarding.returningLogin.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (onSubmit) },
        ...{ class: "form" },
    });
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "returning-login-username",
    });
    (__VLS_unwrap(t, {})('login.usernameLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "returning-login-username",
        value: (__VLS_unwrap(userName, {})),
        type: "text",
        autocomplete: "username",
        required: true,
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "returning-login-password",
    });
    (__VLS_unwrap(t, {})('login.passwordLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "returning-login-password",
        type: "password",
        autocomplete: "current-password",
        required: true,
        'data-testid': "returning-login-password",
    });
    (__VLS_unwrap(password, {}));
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status error" },
            'data-testid': "returning-login-error",
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (error.value);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ class: "submit" },
        type: "submit",
        disabled: (submitting.value),
        'data-testid': "returning-login-submit",
    });
    /** @type {__VLS_StyleScopedClasses['submit']} */ ;
    (submitting.value ? __VLS_unwrap(t, {})('login.submitting') : __VLS_unwrap(t, {})('login.submit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (startNewRealm) },
        type: "button",
        ...{ class: "new-realm" },
        'data-testid': "returning-login-new-realm",
    });
    /** @type {__VLS_StyleScopedClasses['new-realm']} */ ;
    (__VLS_unwrap(t, {})('onboarding.returningLogin.newRealm'));
    // @ts-ignore
    [t, t, t, t, t, t, t, t, player, userName, password, error, error, submitting, submitting,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
