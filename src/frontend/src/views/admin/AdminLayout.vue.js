/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { useAdminWorldStore } from '../../stores/adminWorld';
// Shared shell for every /admin/* tab (issue #27; #29 and #30 add their own
// tabs to the same nav). Access itself is enforced by the router's
// `requiresAdmin` guard — this component only renders the chrome around it.
const auth = useAuthStore();
const router = useRouter();
const adminWorld = useAdminWorldStore();
onMounted(() => {
    void adminWorld.loadWorlds();
});
async function onLogout() {
    await auth.logout();
    await router.push('/');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(adminWorld, {});
    __VLS_withDotValue(auth, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    /** @type {__VLS_StyleScopedClasses['account']} */ ;
    /** @type {__VLS_StyleScopedClasses['topbar']} */ ;
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "admin" },
    });
    /** @type {__VLS_StyleScopedClasses['admin']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "topbar" },
    });
    /** @type {__VLS_StyleScopedClasses['topbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "brand" },
    });
    /** @type {__VLS_StyleScopedClasses['brand']} */ ;
    (__VLS_ctx.$t('adminLayout.brand'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "tabs" },
    });
    /** @type {__VLS_StyleScopedClasses['tabs']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        to: "/admin/worlds", ...{ class: "tab" },
    }));
    const __VLS_2 = __VLS_1({
        to: "/admin/worlds",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    (__VLS_ctx.$t('adminLayout.tabs.worlds'));
    // @ts-ignore
    [$t, $t,];
    let __VLS_6;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        to: "/admin/users", ...{ class: "tab" },
    }));
    const __VLS_8 = __VLS_7({
        to: "/admin/users",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_9;
    const { default: __VLS_11 } = __VLS_nonNull(__VLS_9.slots);
    (__VLS_ctx.$t('adminLayout.tabs.users'));
    // @ts-ignore
    [$t,];
    let __VLS_12;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        // @ts-ignore
        to: "/admin/settlements", ...{ class: "tab" },
    }));
    const __VLS_14 = __VLS_13({
        to: "/admin/settlements",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_15;
    const { default: __VLS_17 } = __VLS_nonNull(__VLS_15.slots);
    (__VLS_ctx.$t('adminLayout.tabs.settlements'));
    // @ts-ignore
    [$t,];
    let __VLS_18;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
        // @ts-ignore
        to: "/admin/reports", ...{ class: "tab" },
    }));
    const __VLS_20 = __VLS_19({
        to: "/admin/reports",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_21;
    const { default: __VLS_23 } = __VLS_nonNull(__VLS_21.slots);
    (__VLS_ctx.$t('adminLayout.tabs.reports'));
    // @ts-ignore
    [$t,];
    let __VLS_24;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        // @ts-ignore
        to: "/admin/activity", ...{ class: "tab" },
    }));
    const __VLS_26 = __VLS_25({
        to: "/admin/activity",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_27;
    const { default: __VLS_29 } = __VLS_nonNull(__VLS_27.slots);
    (__VLS_ctx.$t('adminLayout.tabs.activity'));
    // @ts-ignore
    [$t,];
    let __VLS_30;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        // @ts-ignore
        to: "/admin/economy", ...{ class: "tab" },
    }));
    const __VLS_32 = __VLS_31({
        to: "/admin/economy",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_33;
    const { default: __VLS_35 } = __VLS_nonNull(__VLS_33.slots);
    (__VLS_ctx.$t('adminLayout.tabs.economy'));
    // @ts-ignore
    [$t,];
    let __VLS_36;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
        // @ts-ignore
        to: "/admin/api-keys", ...{ class: "tab" },
    }));
    const __VLS_38 = __VLS_37({
        to: "/admin/api-keys",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_39;
    const { default: __VLS_41 } = __VLS_nonNull(__VLS_39.slots);
    (__VLS_ctx.$t('adminLayout.tabs.apiKeys'));
    // @ts-ignore
    [$t,];
    let __VLS_42;
    /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
    routerLink;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
        // @ts-ignore
        to: "/admin/island-lab", ...{ class: "tab" },
    }));
    const __VLS_44 = __VLS_43({
        to: "/admin/island-lab",
        ...{ class: "tab" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    /** @type {__VLS_StyleScopedClasses['tab']} */ ;
    var __VLS_45;
    const { default: __VLS_47 } = __VLS_nonNull(__VLS_45.slots);
    (__VLS_ctx.$t('adminLayout.tabs.tools'));
    // @ts-ignore
    [$t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "world-select" },
    });
    /** @type {__VLS_StyleScopedClasses['world-select']} */ ;
    if (adminWorld.value.worlds.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(adminWorld.value.worlds.length > 0))
                        throw 0;
                    return (adminWorld.value.selectWorld($event.target.value));
                    // @ts-ignore
                    [adminWorld, adminWorld,];
                } },
            value: (adminWorld.value.selectedWorldId ?? ''),
        });
        const __VLS_48 = __VLS_tryAsConstant((adminWorld.value.worlds));
        for (const [world] of __VLS_vFor(__VLS_nonNull(__VLS_48))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                key: (world.id),
                value: (world.id),
            });
            (world.name);
            // @ts-ignore
            [adminWorld, adminWorld,];
        }
    }
    else if (!adminWorld.value.loading) {
        let __VLS_49;
        /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
        routerLink;
        // @ts-ignore
        const __VLS_50 = __VLS_asFunctionalComponent1(__VLS_49, new __VLS_49({
            // @ts-ignore
            to: "/admin/worlds", ...{ class: "no-worlds" },
        }));
        const __VLS_51 = __VLS_50({
            to: "/admin/worlds",
            ...{ class: "no-worlds" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_50));
        /** @type {__VLS_StyleScopedClasses['no-worlds']} */ ;
        var __VLS_52;
        const { default: __VLS_54 } = __VLS_nonNull(__VLS_52.slots);
        (__VLS_ctx.$t('adminLayout.noWorlds'));
        // @ts-ignore
        [$t, adminWorld,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "account" },
    });
    /** @type {__VLS_StyleScopedClasses['account']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "who" },
    });
    /** @type {__VLS_StyleScopedClasses['who']} */ ;
    (auth.value.user?.displayName ?? auth.value.user?.userName);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (onLogout) },
        ...{ class: "logout" },
    });
    /** @type {__VLS_StyleScopedClasses['logout']} */ ;
    (__VLS_ctx.$t('adminLayout.logout'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    let __VLS_55;
    /** @ts-ignore @type { | typeof __VLS_components.routerView | typeof __VLS_components.RouterView | typeof __VLS_components['router-view']} */
    routerView;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent1(__VLS_55, new __VLS_55({
    // @ts-ignore
    }));
    const __VLS_57 = __VLS_56({}, ...__VLS_functionalComponentArgsRest(__VLS_56));
    // @ts-ignore
    [$t, auth, auth,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
