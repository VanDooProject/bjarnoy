/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { filterFindings, findingKey, summaryRows, visibleFindings, } from '../../views/admin/worldReview';
const { defineProps, defineEmits, } = {};
const props = defineProps();
const emit = defineEmits();
const filter = ref('all');
const showAll = ref(false);
// A new review (another seed) starts from the top again.
watch(() => props.review, () => {
    filter.value = 'all';
    showAll.value = false;
});
const filtered = computed(() => filterFindings(props.review.findings, filter.value));
const rows = computed(() => visibleFindings(filtered.value, showAll.value));
const summary = computed(() => summaryRows(props.review.summary));
const FILTERS = [
    { value: 'all', labelKey: 'filterAll' },
    { value: 'error', labelKey: 'filterError' },
    { value: 'warn', labelKey: 'filterWarn' },
    { value: 'info', labelKey: 'filterInfo' },
];
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(filtered, {});
    __VLS_withDotValue(showAll, {});
    __VLS_withDotValue(rows, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['review']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['sev']} */ ;
    /** @type {__VLS_StyleScopedClasses['warn']} */ ;
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['sev']} */ ;
    /** @type {__VLS_StyleScopedClasses['info']} */ ;
    /** @type {__VLS_StyleScopedClasses['summary']} */ ;
    /** @type {__VLS_StyleScopedClasses['summary']} */ ;
    /** @type {__VLS_StyleScopedClasses['summary']} */ ;
    /** @type {__VLS_StyleScopedClasses['filter']} */ ;
    /** @type {__VLS_StyleScopedClasses['findings']} */ ;
    /** @type {__VLS_StyleScopedClasses['findings']} */ ;
    /** @type {__VLS_StyleScopedClasses['finding']} */ ;
    /** @type {__VLS_StyleScopedClasses['finding']} */ ;
    /** @type {__VLS_StyleScopedClasses['finding']} */ ;
    /** @type {__VLS_StyleScopedClasses['sev']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "review" },
        'data-testid': "world-review",
    });
    /** @type {__VLS_StyleScopedClasses['review']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('adminWorldReview.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    (__VLS_ctx.$t('adminWorldReview.hint'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "badges" },
    });
    /** @type {__VLS_StyleScopedClasses['badges']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge error" },
        'data-testid': "review-errors",
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    (__VLS_ctx.$t('adminWorldReview.errors', { count: __VLS_ctx.review.summary.errors }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge warn" },
        'data-testid': "review-warnings",
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['warn']} */ ;
    (__VLS_ctx.$t('adminWorldReview.warnings', { count: __VLS_ctx.review.summary.warnings }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "badge info" },
        'data-testid': "review-infos",
    });
    /** @type {__VLS_StyleScopedClasses['badge']} */ ;
    /** @type {__VLS_StyleScopedClasses['info']} */ ;
    (__VLS_ctx.$t('adminWorldReview.infos', { count: __VLS_ctx.review.summary.infos }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
        ...{ class: "summary" },
    });
    /** @type {__VLS_StyleScopedClasses['summary']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(summary, {})));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (row.key),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        (__VLS_ctx.$t(`adminWorldReview.${row.key}`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
            ...{ class: ({ flagged: row.flagged }) },
            'data-testid': (`review-${row.key}`),
        });
        /** @type {__VLS_StyleScopedClasses['flagged']} */ ;
        (row.value);
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, review, review, review, summary,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "filter" },
    });
    /** @type {__VLS_StyleScopedClasses['filter']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "review-filter",
    });
    (__VLS_ctx.$t('adminWorldReview.filterLabel'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        id: "review-filter",
        value: (__VLS_unwrap(filter, {})),
        'data-testid': "review-filter",
    });
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(FILTERS, {})));
    for (const [f] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (f.value),
            value: (f.value),
        });
        (__VLS_ctx.$t(`adminWorldReview.${f.labelKey}`));
        // @ts-ignore
        [$t, $t, filter, FILTERS,];
    }
    if (filtered.value.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
            'data-testid': "review-empty",
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        (__VLS_ctx.$t('adminWorldReview.noFindings'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "findings" },
        });
        /** @type {__VLS_StyleScopedClasses['findings']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorldReview.colSeverity'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorldReview.colKind'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorldReview.colIsland'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('adminWorldReview.colMessage'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_2 = __VLS_tryAsConstant((rows.value));
        for (const [f, i] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(filtered.value.length === 0))
                            throw 0;
                        return (__VLS_unwrap(emit, {})('select', f));
                        // @ts-ignore
                        [$t, $t, $t, $t, $t, filtered, rows, emit,];
                    } },
                ...{ onKeydown: (...[$event]) => {
                        void $event;
                        if (!!(filtered.value.length === 0))
                            throw 0;
                        return (__VLS_unwrap(emit, {})('select', f));
                        // @ts-ignore
                        [emit,];
                    } },
                key: (__VLS_unwrap(findingKey, {})(f, i)),
                ...{ class: "finding" },
                ...{ class: ({ selected: __VLS_ctx.selected === f }) },
                'data-testid': "review-finding",
                tabindex: "0",
            });
            /** @type {__VLS_StyleScopedClasses['finding']} */ ;
            /** @type {__VLS_StyleScopedClasses['selected']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "sev" },
                ...{ class: (f.severity) },
            });
            /** @type {__VLS_StyleScopedClasses['sev']} */ ;
            (__VLS_ctx.$t(`adminWorldReview.severity.${f.severity}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t(`adminWorldReview.kind.${f.kind}`));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num" },
            });
            /** @type {__VLS_StyleScopedClasses['num']} */ ;
            (f.island);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (f.message);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "hex" },
            });
            /** @type {__VLS_StyleScopedClasses['hex']} */ ;
            (f.q);
            (f.r);
            // @ts-ignore
            [$t, $t, findingKey, selected,];
        }
    }
    if (!showAll.value && filtered.value.length > rows.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "more" },
        });
        /** @type {__VLS_StyleScopedClasses['more']} */ ;
        (__VLS_ctx.$t('adminWorldReview.showingFirst', { shown: rows.value.length, total: filtered.value.length }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(!showAll.value && filtered.value.length > rows.value.length))
                        throw 0;
                    return (showAll.value = true);
                    // @ts-ignore
                    [$t, filtered, filtered, rows, rows, showAll, showAll,];
                } },
            ...{ class: "secondary" },
            'data-testid': "review-show-all",
        });
        /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
        (__VLS_ctx.$t('adminWorldReview.showAll'));
    }
    // @ts-ignore
    [$t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
