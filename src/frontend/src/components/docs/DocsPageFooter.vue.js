/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import DocsPageArt from './DocsPageArt.vue';
import { docsNeighbours, docsPageById } from '../../lib/docs/docsPages';
const { defineProps, } = {};
const props = defineProps();
const related = () => props.page.related.map((r) => ({ ...r, target: docsPageById(r.page) }));
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
    void {};
    /** @type {__VLS_StyleScopedClasses['related-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['box']} */ ;
    /** @type {__VLS_StyleScopedClasses['related-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['related-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['box']} */ ;
    /** @type {__VLS_StyleScopedClasses['box']} */ ;
    /** @type {__VLS_StyleScopedClasses['related-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['box']} */ ;
    /** @type {__VLS_StyleScopedClasses['pager']} */ ;
    /** @type {__VLS_StyleScopedClasses['next']} */ ;
    /** @type {__VLS_StyleScopedClasses['related-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['box']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
        ...{ class: "docs-footer" },
        'data-testid': "docs-footer",
    });
    /** @type {__VLS_StyleScopedClasses['docs-footer']} */ ;
    if (__VLS_ctx.page.related.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "related" },
            'aria-labelledby': "docs-related-heading",
        });
        /** @type {__VLS_StyleScopedClasses['related']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            id: "docs-related-heading",
        });
        (__VLS_ctx.$t('docs.related.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cards" },
        });
        /** @type {__VLS_StyleScopedClasses['cards']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(related, {})()));
        for (const [r] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            let __VLS_1;
            /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
            RouterLink;
            // @ts-ignore
            const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
                // @ts-ignore
                key: (r.page), to: (r.target.to), ...{ class: "related-card" }, dataRelated: (r.page),
            }));
            const __VLS_3 = __VLS_2({
                key: (r.page),
                to: (r.target.to),
                ...{ class: "related-card" },
                dataRelated: (r.page),
            }, ...__VLS_functionalComponentArgsRest(__VLS_2));
            /** @type {__VLS_StyleScopedClasses['related-card']} */ ;
            var __VLS_4;
            const { default: __VLS_6 } = __VLS_nonNull(__VLS_4.slots);
            const __VLS_7 = DocsPageArt;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                // @ts-ignore
                art: (r.target.art), size: (48), ...{ class: "art" },
            }));
            const __VLS_9 = __VLS_8({
                art: (r.target.art),
                size: (48),
                ...{ class: "art" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
            /** @type {__VLS_StyleScopedClasses['art']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "text" },
            });
            /** @type {__VLS_StyleScopedClasses['text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "title" },
            });
            /** @type {__VLS_StyleScopedClasses['title']} */ ;
            (__VLS_ctx.$t(r.target.titleKey));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "reason" },
            });
            /** @type {__VLS_StyleScopedClasses['reason']} */ ;
            (__VLS_ctx.$t(r.reasonKey));
            // @ts-ignore
            [page, $t, $t, $t, related,];
            // @ts-ignore
            [];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "pager" },
        'aria-label': (__VLS_ctx.$t('docs.nav.pager')),
    });
    /** @type {__VLS_StyleScopedClasses['pager']} */ ;
    if (__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).previous) {
        let __VLS_12;
        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
        RouterLink;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            to: (__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).previous.to), ...{ class: "box prev" }, rel: "prev", dataTestid: "docs-prev",
        }));
        const __VLS_14 = __VLS_13({
            to: (__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).previous.to),
            ...{ class: "box prev" },
            rel: "prev",
            dataTestid: "docs-prev",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        /** @type {__VLS_StyleScopedClasses['box']} */ ;
        /** @type {__VLS_StyleScopedClasses['prev']} */ ;
        var __VLS_15;
        const { default: __VLS_17 } = __VLS_nonNull(__VLS_15.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "dir" },
        });
        /** @type {__VLS_StyleScopedClasses['dir']} */ ;
        (__VLS_ctx.$t('docs.nav.previous'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (__VLS_ctx.$t(__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).previous.titleKey));
        // @ts-ignore
        [page, page, page, $t, $t, $t, docsNeighbours, docsNeighbours, docsNeighbours,];
    }
    if (__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).next) {
        let __VLS_18;
        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
        RouterLink;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
            // @ts-ignore
            to: (__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).next.to), ...{ class: "box next" }, rel: "next", dataTestid: "docs-next",
        }));
        const __VLS_20 = __VLS_19({
            to: (__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).next.to),
            ...{ class: "box next" },
            rel: "next",
            dataTestid: "docs-next",
        }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        /** @type {__VLS_StyleScopedClasses['box']} */ ;
        /** @type {__VLS_StyleScopedClasses['next']} */ ;
        var __VLS_21;
        const { default: __VLS_23 } = __VLS_nonNull(__VLS_21.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "dir" },
        });
        /** @type {__VLS_StyleScopedClasses['dir']} */ ;
        (__VLS_ctx.$t('docs.nav.next'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (__VLS_ctx.$t(__VLS_unwrap(docsNeighbours, {})(__VLS_ctx.page.id).next.titleKey));
        // @ts-ignore
        [page, page, page, $t, $t, docsNeighbours, docsNeighbours, docsNeighbours,];
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
