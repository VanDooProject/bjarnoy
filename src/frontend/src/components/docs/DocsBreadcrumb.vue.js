/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { routeLocationKey } from 'vue-router';
import DocsPageArt from './DocsPageArt.vue';
import { DOCS_GROUPS, docsGroupOf } from '../../lib/docs/docsPages';
const { defineProps, } = {};
const props = defineProps();
const open = ref(null);
const root = ref(null);
const group = () => (props.page ? docsGroupOf(props.page.id) : undefined);
function items(menu) {
    return Array.from(root.value?.querySelectorAll(`[data-menu="${menu}"] [role=menuitem]`) ?? []);
}
function triggerOf(menu) {
    return root.value?.querySelector(`[data-trigger="${menu}"]`) ?? null;
}
async function show(menu) {
    open.value = menu;
    await nextTick();
    const list = items(menu);
    (list.find((el) => el.hasAttribute('aria-current')) ?? list[0])?.focus();
}
function close(refocus = false) {
    const was = open.value;
    open.value = null;
    if (refocus && was)
        triggerOf(was)?.focus();
}
function toggle(menu) {
    if (open.value === menu)
        close();
    else
        void show(menu);
}
function onTriggerKey(e, menu) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        void show(menu);
    }
    else if (e.key === 'Escape' && open.value) {
        e.preventDefault();
        close(true);
    }
}
function onMenuKey(e, menu) {
    const list = items(menu);
    const at = list.indexOf(document.activeElement);
    const go = (i) => {
        e.preventDefault();
        list[(i + list.length) % list.length]?.focus();
    };
    if (e.key === 'ArrowDown')
        go(at + 1);
    else if (e.key === 'ArrowUp')
        go(at - 1);
    else if (e.key === 'Home')
        go(0);
    else if (e.key === 'End')
        go(list.length - 1);
    else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
    }
    else if (e.key === 'Tab')
        close();
}
function onOutside(e) {
    if (open.value && root.value && !root.value.contains(e.target))
        close();
}
onMounted(() => document.addEventListener('pointerdown', onOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
// A navigation (also back/forward) closes whatever is open.
const route = inject(routeLocationKey, null);
watch(() => route?.fullPath, () => close());
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
    __VLS_withDotValue(open, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['sep']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-crumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-crumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['chev']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['chev']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['chev']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['chev']} */ ;
    /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-crumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['chev']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    /** @type {__VLS_StyleScopedClasses['crumb-wrap']} */ ;
    /** @type {__VLS_StyleScopedClasses['menu']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ref: "root",
        ...{ class: "breadcrumb" },
        'aria-label': (__VLS_ctx.$t('docs.nav.breadcrumb')),
        'data-testid': "docs-breadcrumb",
    });
    /** @type {__VLS_StyleScopedClasses['breadcrumb']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        to: "/docs", ...{ class: "crumb docs-crumb" },
    }));
    const __VLS_2 = __VLS_1({
        to: "/docs",
        ...{ class: "crumb docs-crumb" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['crumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-crumb']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    (__VLS_ctx.$t('docs.nav.docs'));
    // @ts-ignore
    [$t, $t,];
    if (__VLS_ctx.page && __VLS_unwrap(group, {})()) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "sep" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['sep']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "crumb-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['crumb-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                        throw 0;
                    return (toggle('group'));
                    // @ts-ignore
                    [page, group,];
                } },
            ...{ onKeydown: (...[$event]) => {
                    void $event;
                    if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                        throw 0;
                    return (onTriggerKey($event, 'group'));
                    // @ts-ignore
                    [];
                } },
            type: "button",
            ...{ class: "crumb trigger" },
            'data-trigger': "group",
            'aria-haspopup': "menu",
            'aria-expanded': (open.value === 'group'),
            'aria-label': (__VLS_ctx.$t('docs.nav.groupsMenu', { group: __VLS_ctx.$t(__VLS_unwrap(group, {})().titleKey) })),
        });
        /** @type {__VLS_StyleScopedClasses['crumb']} */ ;
        /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
        (__VLS_ctx.$t(__VLS_unwrap(group, {})().titleKey));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "chev" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['chev']} */ ;
        if (open.value === 'group') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ onKeydown: (...[$event]) => {
                        void $event;
                        if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                            throw 0;
                        if (!(open.value === 'group'))
                            throw 0;
                        return (onMenuKey($event, 'group'));
                        // @ts-ignore
                        [$t, $t, $t, group, group, open, open,];
                    } },
                ...{ class: "menu" },
                role: "menu",
                'data-menu': "group",
                'aria-label': (__VLS_ctx.$t('docs.nav.groups')),
            });
            /** @type {__VLS_StyleScopedClasses['menu']} */ ;
            const __VLS_6 = __VLS_tryAsConstant((__VLS_unwrap(DOCS_GROUPS, {})));
            for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (g.id),
                    role: "none",
                });
                let __VLS_7;
                /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
                RouterLink;
                // @ts-ignore
                const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                    // @ts-ignore
                    ...{ 'onClick': {} }, to: ({ path: '/docs', hash: `#group-${g.id}` }), role: "menuitem", tabindex: "-1", ...{ class: "item" }, ...{ class: ({ current: g.id === __VLS_unwrap(group, {})().id }) }, 'aria-current': (g.id === __VLS_unwrap(group, {})().id ? 'true' : undefined), dataGroup: (g.id),
                }));
                const __VLS_9 = __VLS_8({
                    ...{ 'onClick': {} },
                    to: ({ path: '/docs', hash: `#group-${g.id}` }),
                    role: "menuitem",
                    tabindex: "-1",
                    ...{ class: "item" },
                    ...{ class: ({ current: g.id === __VLS_unwrap(group, {})().id }) },
                    'aria-current': (g.id === __VLS_unwrap(group, {})().id ? 'true' : undefined),
                    dataGroup: (g.id),
                }, ...__VLS_functionalComponentArgsRest(__VLS_8));
                let __VLS_12;
                const __VLS_13 = {
                    /** @type {typeof __VLS_12.click} */
                    onClick: (...[$event]) => {
                        void $event;
                        if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                            throw 0;
                        if (!(open.value === 'group'))
                            throw 0;
                        return (close());
                        // @ts-ignore
                        [$t, group, group, DOCS_GROUPS,];
                    },
                };
                void __VLS_13;
                /** @type {__VLS_StyleScopedClasses['item']} */ ;
                /** @type {__VLS_StyleScopedClasses['current']} */ ;
                var __VLS_10;
                var __VLS_11;
                const { default: __VLS_14 } = __VLS_nonNull(__VLS_10.slots);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "item-title" },
                });
                /** @type {__VLS_StyleScopedClasses['item-title']} */ ;
                (__VLS_ctx.$t(g.titleKey));
                // @ts-ignore
                [$t,];
                // @ts-ignore
                [];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "sep" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['sep']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "crumb-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['crumb-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                        throw 0;
                    return (toggle('page'));
                    // @ts-ignore
                    [];
                } },
            ...{ onKeydown: (...[$event]) => {
                    void $event;
                    if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                        throw 0;
                    return (onTriggerKey($event, 'page'));
                    // @ts-ignore
                    [];
                } },
            type: "button",
            ...{ class: "crumb trigger current-page" },
            'data-trigger': "page",
            'aria-haspopup': "menu",
            'aria-expanded': (open.value === 'page'),
            'aria-current': ('page'),
            'aria-label': (__VLS_ctx.$t('docs.nav.pagesMenu', { page: __VLS_ctx.$t(__VLS_ctx.page.titleKey), group: __VLS_ctx.$t(__VLS_unwrap(group, {})().titleKey) })),
        });
        /** @type {__VLS_StyleScopedClasses['crumb']} */ ;
        /** @type {__VLS_StyleScopedClasses['trigger']} */ ;
        /** @type {__VLS_StyleScopedClasses['current-page']} */ ;
        (__VLS_ctx.$t(__VLS_ctx.page.titleKey));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "chev" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['chev']} */ ;
        if (open.value === 'page') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ onKeydown: (...[$event]) => {
                        void $event;
                        if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                            throw 0;
                        if (!(open.value === 'page'))
                            throw 0;
                        return (onMenuKey($event, 'page'));
                        // @ts-ignore
                        [$t, $t, $t, $t, page, page, group, open, open,];
                    } },
                ...{ class: "menu" },
                role: "menu",
                'data-menu': "page",
                'aria-label': (__VLS_ctx.$t('docs.nav.pagesIn', { group: __VLS_ctx.$t(__VLS_unwrap(group, {})().titleKey) })),
            });
            /** @type {__VLS_StyleScopedClasses['menu']} */ ;
            const __VLS_15 = __VLS_tryAsConstant((__VLS_unwrap(group, {})().pages));
            for (const [p] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (p.id),
                    role: "none",
                });
                let __VLS_16;
                /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
                RouterLink;
                // @ts-ignore
                const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
                    // @ts-ignore
                    ...{ 'onClick': {} }, to: (p.to), role: "menuitem", tabindex: "-1", ...{ class: "item" }, ...{ class: ({ current: p.id === __VLS_ctx.page.id }) }, 'aria-current': (p.id === __VLS_ctx.page.id ? 'page' : undefined), dataPage: (p.id),
                }));
                const __VLS_18 = __VLS_17({
                    ...{ 'onClick': {} },
                    to: (p.to),
                    role: "menuitem",
                    tabindex: "-1",
                    ...{ class: "item" },
                    ...{ class: ({ current: p.id === __VLS_ctx.page.id }) },
                    'aria-current': (p.id === __VLS_ctx.page.id ? 'page' : undefined),
                    dataPage: (p.id),
                }, ...__VLS_functionalComponentArgsRest(__VLS_17));
                let __VLS_21;
                const __VLS_22 = {
                    /** @type {typeof __VLS_21.click} */
                    onClick: (...[$event]) => {
                        void $event;
                        if (!(__VLS_ctx.page && __VLS_unwrap(group, {})()))
                            throw 0;
                        if (!(open.value === 'page'))
                            throw 0;
                        return (close());
                        // @ts-ignore
                        [$t, $t, page, page, group, group,];
                    },
                };
                void __VLS_22;
                /** @type {__VLS_StyleScopedClasses['item']} */ ;
                /** @type {__VLS_StyleScopedClasses['current']} */ ;
                var __VLS_19;
                var __VLS_20;
                const { default: __VLS_23 } = __VLS_nonNull(__VLS_19.slots);
                const __VLS_24 = DocsPageArt;
                // @ts-ignore
                const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
                    // @ts-ignore
                    art: (p.art), size: (26),
                }));
                const __VLS_26 = __VLS_25({
                    art: (p.art),
                    size: (26),
                }, ...__VLS_functionalComponentArgsRest(__VLS_25));
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "item-title" },
                });
                /** @type {__VLS_StyleScopedClasses['item-title']} */ ;
                (__VLS_ctx.$t(p.titleKey));
                // @ts-ignore
                [$t,];
                // @ts-ignore
                [];
            }
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
