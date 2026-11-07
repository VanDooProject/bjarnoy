/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ApiError } from '../api/client';
import { useAuthStore } from '../stores/auth';
import { usePlayerStore } from '../stores/player';
import { useUnsavedInput } from '../composables/useUnsavedInput';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';
const auth = useAuthStore();
const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n({ useScope: 'global' });
const userName = ref('');
const password = ref('');
const confirmPassword = ref('');
useUnsavedInput(() => userName.value !== '' || password.value !== '' || confirmPassword.value !== '');
const submitting = ref(false);
const error = ref(null);
async function onSubmit() {
    if (submitting.value)
        return;
    error.value = null;
    if (password.value !== confirmPassword.value) {
        error.value = t('register.errors.passwordMismatch');
        return;
    }
    submitting.value = true;
    try {
        // Passing the local player id lets the backend claim any settlement
        // still founded under it (AuthService.RegisterAsync's claim loop) — an
        // anonymous player who registers keeps the settlement they already
        // built instead of starting over.
        await auth.register(userName.value, password.value, player.id);
        const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
        await router.push(redirect);
    }
    catch (err) {
        if (err instanceof ApiError && err.status === 409) {
            error.value = t('register.errors.usernameTaken');
        }
        else if (err instanceof ApiError && err.status === 400) {
            error.value = t('register.errors.validation');
        }
        else {
            error.value = t('register.errors.generic');
        }
    }
    finally {
        submitting.value = false;
    }
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
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
        ...{ class: "register" },
    });
    /** @type {__VLS_StyleScopedClasses['register']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "topbar" },
    });
    /** @type {__VLS_StyleScopedClasses['topbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "brand" },
    });
    /** @type {__VLS_StyleScopedClasses['brand']} */ ;
    (__VLS_unwrap(t, {})('register.brand'));
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
    (__VLS_unwrap(t, {})('register.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_unwrap(t, {})('register.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (onSubmit) },
        ...{ class: "form" },
    });
    /** @type {__VLS_StyleScopedClasses['form']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "userName",
    });
    (__VLS_unwrap(t, {})('register.usernameLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "userName",
        value: (__VLS_unwrap(userName, {})),
        type: "text",
        autocomplete: "username",
        minlength: "3",
        maxlength: "50",
        required: true,
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "password",
    });
    (__VLS_unwrap(t, {})('register.passwordLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "password",
        type: "password",
        autocomplete: "new-password",
        minlength: "8",
        maxlength: "200",
        required: true,
    });
    (__VLS_unwrap(password, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "confirmPassword",
    });
    (__VLS_unwrap(t, {})('register.confirmPasswordLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "confirmPassword",
        type: "password",
        autocomplete: "new-password",
        minlength: "8",
        maxlength: "200",
        required: true,
    });
    (__VLS_unwrap(confirmPassword, {}));
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
    (submitting.value ? __VLS_unwrap(t, {})('register.submitting') : __VLS_unwrap(t, {})('register.submit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (router.value.push({ path: '/login', query: route.value.query }));
                // @ts-ignore
                [t, t, t, t, t, t, t, t, userName, password, confirmPassword, error, error, submitting, submitting, router, route,];
            } },
        ...{ class: "link" },
    });
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    (__VLS_unwrap(t, {})('register.loginLink'));
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
    (__VLS_unwrap(t, {})('register.back'));
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
