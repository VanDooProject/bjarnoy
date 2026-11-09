/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, inject } from 'vue';
import { routeLocationKey } from 'vue-router';
import TopBar from '../hud/TopBar.vue';
import HudNav from '../hud/HudNav.vue';
import MobileHudDrawer from '../hud/MobileHudDrawer.vue';
import { useDocsAdminNotes } from '../../composables/useDocsAdminNotes';
import { provideFirstMentions } from '../../composables/useFirstMentions';
import { docsPageByPath } from '../../lib/docs/docsPages';
import DocsBreadcrumb from './DocsBreadcrumb.vue';
import DocsHeaderArt from './DocsHeaderArt.vue';
import DocsPageFooter from './DocsPageFooter.vue';
const { defineProps, withDefaults, } = {};
const __VLS_props = withDefaults(defineProps(), { intro: undefined, breadcrumb: true, wide: false, hero: false });
const route = inject(routeLocationKey, null);
const entry = computed(() => (route ? docsPageByPath(route.path) : undefined));
const { canToggle, enabled, setEnabled } = useDocsAdminNotes();
// Only a building's first mention on the page is a link (BuildingLink.vue).
provideFirstMentions();
const __VLS_defaults = { intro: undefined, breadcrumb: true, wide: false, hero: false };
void __VLS_defaults;
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
    __VLS_withDotValue(entry, {});
    __VLS_withDotValue(canToggle, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['page']} */ ;
    /** @type {__VLS_StyleScopedClasses['page']} */ ;
    /** @type {__VLS_StyleScopedClasses['wide']} */ ;
    /** @type {__VLS_StyleScopedClasses['page']} */ ;
    /** @type {__VLS_StyleScopedClasses['wide']} */ ;
    /** @type {__VLS_StyleScopedClasses['page']} */ ;
    /** @type {__VLS_StyleScopedClasses['wide']} */ ;
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-toggle']} */ ;
    /** @type {__VLS_StyleScopedClasses['admin-toggle']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "docs-page" },
    });
    /** @type {__VLS_StyleScopedClasses['docs-page']} */ ;
    const __VLS_0 = TopBar || TopBar;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        docked: true, title: (__VLS_ctx.title), caption: (__VLS_ctx.caption),
    }));
    const __VLS_2 = __VLS_1({
        docked: true,
        title: (__VLS_ctx.title),
        caption: (__VLS_ctx.caption),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = HudNav;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    // @ts-ignore
    }));
    const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    {
        const { drawer: __VLS_11 } = __VLS_nonNull(__VLS_3.slots);
        const [{ close }] = __VLS_vSlot(__VLS_nonNull(__VLS_11));
        const __VLS_12 = MobileHudDrawer;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            ...{ 'onClose': {} },
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onClose': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_17;
        const __VLS_18 = {
            /** @type {typeof __VLS_17.close} */
            onClose: (close),
        };
        void __VLS_18;
        var __VLS_15;
        var __VLS_16;
        // @ts-ignore
        [title, caption,];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "page docs-scale" },
        ...{ class: ({ wide: __VLS_ctx.wide }) },
    });
    /** @type {__VLS_StyleScopedClasses['page']} */ ;
    /** @type {__VLS_StyleScopedClasses['docs-scale']} */ ;
    /** @type {__VLS_StyleScopedClasses['wide']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "head" },
        ...{ class: ({ 'hero-head': __VLS_ctx.hero }) },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['hero-head']} */ ;
    if (__VLS_ctx.breadcrumb) {
        const __VLS_19 = DocsBreadcrumb;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
            // @ts-ignore
            page: (entry.value),
        }));
        const __VLS_21 = __VLS_20({
            page: (entry.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head-body" },
    });
    /** @type {__VLS_StyleScopedClasses['head-body']} */ ;
    if (entry.value && __VLS_ctx.breadcrumb) {
        const __VLS_24 = DocsHeaderArt;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
            // @ts-ignore
            page: (entry.value),
        }));
        const __VLS_26 = __VLS_25({
            page: (entry.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head-text" },
    });
    /** @type {__VLS_StyleScopedClasses['head-text']} */ ;
    if (!__VLS_ctx.hero) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
        (__VLS_ctx.title);
    }
    if (__VLS_ctx.intro && !__VLS_ctx.hero) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "intro" },
        });
        /** @type {__VLS_StyleScopedClasses['intro']} */ ;
        (__VLS_ctx.intro);
    }
    var __VLS_29 = {};
    if (canToggle.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "admin-toggle" },
            'data-testid': "docs-admin-toggle",
        });
        /** @type {__VLS_StyleScopedClasses['admin-toggle']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!(canToggle.value))
                        throw 0;
                    return (__VLS_unwrap(setEnabled, {})($event.target.checked));
                    // @ts-ignore
                    [title, wide, hero, hero, hero, breadcrumb, breadcrumb, entry, entry, entry, intro, intro, canToggle, setEnabled,];
                } },
            type: "checkbox",
            checked: (__VLS_unwrap(enabled, {})),
        });
        (__VLS_ctx.$t('docs.adminNotes.toggle'));
    }
    if (__VLS_ctx.$slots.wide) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "wide-slot" },
        });
        /** @type {__VLS_StyleScopedClasses['wide-slot']} */ ;
        var __VLS_31 = {};
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    var __VLS_33 = {};
    if (entry.value && __VLS_ctx.breadcrumb) {
        const __VLS_35 = DocsPageFooter;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({
            // @ts-ignore
            page: (entry.value),
        }));
        const __VLS_37 = __VLS_36({
            page: (entry.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    }
    var __VLS_30 = __VLS_29, __VLS_32 = __VLS_31, __VLS_34 = __VLS_33;
    // @ts-ignore
    [breadcrumb, entry, entry, enabled, $t, $slots,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
const __VLS_export = {};
export default {};
