/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../stores/world';
import { useLoginForm } from '../composables/useLoginForm';
import { useUnsavedInput } from '../composables/useUnsavedInput';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
const world = useWorldStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n({ useScope: 'global' });
const { userName, password, submitting, error, login, restoreRealmIfAny } = useLoginForm();
useUnsavedInput(() => userName.value !== '' || password.value !== '');
// Login↔world linkage (docs/plans/returning-player-world-switching.md):
// arriving here from ReturningPlayerMenu.vue's "Log in" link, in the
// context of a specific world, carries that world along so this page can
// found/return to it immediately after authenticating instead of dropping
// back to a generic landing page. `worldName` rides along in the query too
// (see that component's own comment) purely for display here — no second
// API round-trip needed just to show a name.
const linkedWorldId = computed(() => (typeof route.query.worldId === 'string' ? route.query.worldId : null));
const linkedWorldName = computed(() => (typeof route.query.worldName === 'string' ? route.query.worldName : null));
async function onSubmit() {
    if (!(await login(userName.value, password.value)))
        return;
    if (linkedWorldId.value) {
        // Same mechanism WorldPickerView.vue's own `joinOrReturn` uses: joins
        // (or returns to) the linked world, then lands in the
        // founding/settlement flow for it.
        await world.joinWorld(linkedWorldId.value);
    }
    else {
        // Player logout/login gate: a plain login (no linked world) still needs
        // this account's realm in whatever world is already loaded restored
        // before landing back in the game — see useLoginForm's own comment.
        await restoreRealmIfAny();
    }
    const redirect = linkedWorldId.value ? '/' : typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
}
// Lets the Aspire dashboard's "Log in as admin" dev-only link carry the
// generated bootstrap credentials straight through as a one-click login,
// instead of a dev having to copy a username/password out of the dashboard
// and paste them in by hand.
onMounted(() => {
    const queryUserName = route.query.username;
    const queryPassword = route.query.password;
    if (typeof queryUserName === 'string' && typeof queryPassword === 'string') {
        userName.value = queryUserName;
        password.value = queryPassword;
        void onSubmit();
    }
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(linkedWorldId, {});
    __VLS_withDotValue(linkedWorldName, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(submitting, {});
    __VLS_withDotValue(router, {});
    __VLS_withDotValue(route, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    /** @type {__VLS_StyleScopedClasses['submit']} */ ;
    /** @type {__VLS_StyleScopedClasses['back']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "login" },
    });
    /** @type {__VLS_StyleScopedClasses['login']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "topbar" },
    });
    /** @type {__VLS_StyleScopedClasses['topbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "brand" },
    });
    /** @type {__VLS_StyleScopedClasses['brand']} */ ;
    (__VLS_unwrap(t, {})('login.brand'));
    const __VLS_0 = LocaleSwitcher;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    // @ts-ignore
    }));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_unwrap(t, {})('login.title'));
    if (linkedWorldId.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "world-linked" },
        });
        /** @type {__VLS_StyleScopedClasses['world-linked']} */ ;
        (linkedWorldName.value
            ? __VLS_unwrap(t, {})('login.continueInWorld', { worldName: linkedWorldName.value })
            : __VLS_unwrap(t, {})('login.continueInWorldGeneric'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (onSubmit) },
        ...{ class: "form" },
    });
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "userName",
    });
    (__VLS_unwrap(t, {})('login.usernameLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "userName",
        value: (__VLS_unwrap(userName, {})),
        type: "text",
        autocomplete: "username",
        required: true,
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "password",
    });
    (__VLS_unwrap(t, {})('login.passwordLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "password",
        type: "password",
        autocomplete: "current-password",
        required: true,
    });
    (__VLS_unwrap(password, {}));
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (error.value);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ class: "submit" },
        type: "submit",
        disabled: (submitting.value),
    });
    /** @type {__VLS_StyleScopedClasses['submit']} */ ;
    (submitting.value ? __VLS_unwrap(t, {})('login.submitting') : __VLS_unwrap(t, {})('login.submit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (router.value.push({ path: '/register', query: route.value.query }));
                // @ts-ignore
                [t, t, t, t, t, t, t, t, linkedWorldId, linkedWorldName, linkedWorldName, userName, password, error, error, submitting, submitting, router, route,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    (__VLS_unwrap(t, {})('login.registerLink'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (router.value.push('/'));
                // @ts-ignore
                [t, router,];
            } },
        ...{ class: "back" },
    });
    /** @type {__VLS_StyleScopedClasses['back']} */ ;
    (__VLS_unwrap(t, {})('login.back'));
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
