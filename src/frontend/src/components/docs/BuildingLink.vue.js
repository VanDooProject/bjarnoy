/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import AtlasSprite from '../AtlasSprite.vue';
import { useBuildingCatalogueStore } from '../../stores/buildingCatalogue';
import { useFirstMentions } from '../../composables/useFirstMentions';
import { buildingName, resourceName, terrainName } from '../../i18n/catalogueNames';
import { buildingArt } from '../../lib/map/buildingArt';
import { maxLevelFor } from '../../lib/map/buildingEconomy';
import { graphCategoryOf } from '../../lib/techtree/buildingPresentation';
const { defineProps, } = {};
const props = defineProps();
const { t } = useI18n({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
const owner = {};
const mentions = useFirstMentions();
const isFirst = props.always || !mentions || mentions.claim(props.type, owner);
onBeforeUnmount(() => {
    if (!props.always)
        mentions?.release(props.type, owner);
});
const name = computed(() => props.label ?? buildingName(props.type));
const target = computed(() => ({ path: '/docs/tech-tree', hash: `#${props.type}` }));
const maxLevel = computed(() => maxLevelFor(props.type) || catalogue.byType[props.type]?.at(-1)?.level || 1);
/** The building at its highest level; none for a type the art pack has no picture of. */
const art = computed(() => buildingArt(props.type, maxLevel.value));
const ratio = computed(() => (art.value?.kind === 'atlas' ? art.value.frame.frame.w / art.value.frame.frame.h : 2 / 3));
const iconStyle = (height) => ({ height, width: `calc(${height} * ${ratio.value})` });
/** "<resource/role> · levels 1–N · <ground>", from the catalogue; a part the catalogue has not loaded yet is left out. */
const meta = computed(() => {
    const parts = [];
    const levels = catalogue.byType[props.type];
    if (levels && levels.length > 0) {
        const top = levels[levels.length - 1];
        const produced = ['wood', 'stone', 'food', 'iron'].filter((r) => top.productionPerHour[r] > 0);
        parts.push(produced.length > 0 && produced.length <= 2
            ? produced.map(resourceName).join(' / ')
            : t(`docs.techTree.categories.${graphCategoryOf(props.type)}`));
    }
    parts.push(t('docs.buildingLink.levels', { max: maxLevel.value }));
    const first = levels?.[0];
    if (first) {
        parts.push(first.requiresCoastalWater
            ? t('docs.techTree.terrainCoastal')
            : first.allowedTerrain.length === 0
                ? t('docs.techTree.terrainAny')
                : first.allowedTerrain.map(terrainName).join(', '));
    }
    return parts.join(' · ');
});
// --- Preview ---------------------------------------------------------------
const tipId = `building-tip-${useId()}`;
const rootEl = shallowRef(null);
const cardEl = shallowRef(null);
const open = ref(false);
const above = ref(false);
const position = ref(null);
/** The preview was opened by a tap: the next tap on the name follows the link. */
let armed = false;
let pointerType = 'mouse';
/**
 * The card is fixed to the viewport (a table's scroll box would clip it): under the name, clamped into the viewport,
 * above it when there is no room below. Runs again on scroll and resize, so the card stays with its name (focusing a
 * link scrolls it into view, which must not close the card).
 */
function place() {
    const root = rootEl.value;
    const card = cardEl.value;
    if (!root || !card)
        return;
    const r = root.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    above.value = r.bottom + h > window.innerHeight - 8 && r.top > h + 8;
    position.value = {
        left: Math.max(8, Math.min(r.left, vw - 8 - w)),
        top: above.value ? r.top - h : r.bottom,
    };
}
function close() {
    if (!open.value)
        return;
    open.value = false;
    armed = false;
    position.value = null;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('scroll', place, true);
    window.removeEventListener('resize', place);
}
function onOutside(event) {
    if (!rootEl.value?.contains(event.target))
        close();
}
async function show() {
    if (open.value)
        return;
    open.value = true;
    void catalogue.load();
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    await nextTick();
    place();
}
onBeforeUnmount(close);
function onFocusOut(event) {
    if (!rootEl.value?.contains(event.relatedTarget))
        close();
}
function onClick(event) {
    // Runs in the capture phase, ahead of the router's own click handler. A tap first opens the preview; the link
    // in the preview (or a second tap on the name) navigates.
    if (pointerType === 'touch' && !armed) {
        event.preventDefault();
        armed = true;
        void show();
    }
}
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
    __VLS_withDotValue(isFirst, {});
    __VLS_withDotValue(open, {});
    __VLS_withDotValue(pointerType, {});
    __VLS_withDotValue(art, {});
    __VLS_withDotValue(position, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['link']} */ ;
    /** @type {__VLS_StyleScopedClasses['icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['atlas-sprite']} */ ;
    /** @type {__VLS_StyleScopedClasses['icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['big-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['preview']} */ ;
    /** @type {__VLS_StyleScopedClasses['big-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    if (!isFirst.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "building-name" },
            'data-building-link': "plain",
        });
        /** @type {__VLS_StyleScopedClasses['building-name']} */ ;
        (__VLS_unwrap(name, {}));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onMouseenter: (show) },
            ...{ onMouseleave: (close) },
            ...{ onFocusin: (show) },
            ...{ onFocusout: (onFocusOut) },
            ...{ onKeydown: (close) },
            ref: "rootEl",
            ...{ class: "building-link" },
            'data-building-link': "link",
            'data-type': (__VLS_ctx.type),
        });
        /** @type {__VLS_StyleScopedClasses['building-link']} */ ;
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
        RouterLink;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            ...{ 'onPointerdown': {} }, ...{ 'onClick': {} }, to: (__VLS_unwrap(target, {})), ...{ class: "link" }, 'aria-describedby': (open.value ? __VLS_unwrap(tipId, {}) : undefined),
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onPointerdown': {} },
            ...{ 'onClick': {} },
            to: (__VLS_unwrap(target, {})),
            ...{ class: "link" },
            'aria-describedby': (open.value ? __VLS_unwrap(tipId, {}) : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = {
            /** @type {typeof __VLS_5.pointerdown} */
            onPointerdown: (...[$event]) => {
                void $event;
                __VLS_withDotValue(pointerType, {});
                if (!!(!isFirst.value))
                    throw 0;
                return (pointerType.value = $event.pointerType);
                // @ts-ignore
                [isFirst, name, type, target, open, tipId, pointerType,];
            },
        };
        void __VLS_6;
        const __VLS_7 = {
            /** @type {typeof __VLS_5.click} */
            onClick: (onClick),
        };
        void __VLS_7;
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        var __VLS_3;
        var __VLS_4;
        const { default: __VLS_8 } = __VLS_nonNull(__VLS_3.slots);
        if (art.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "icon" },
                ...{ style: (__VLS_unwrap(iconStyle, {})('1.25em')) },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['icon']} */ ;
            if (art.value.kind === 'atlas') {
                const __VLS_9 = AtlasSprite;
                // @ts-ignore
                const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
                    // @ts-ignore
                    frame: (art.value.frame),
                }));
                const __VLS_11 = __VLS_10({
                    frame: (art.value.frame),
                }, ...__VLS_functionalComponentArgsRest(__VLS_10));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                    src: (art.value.url),
                    alt: "",
                });
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "label" },
        });
        /** @type {__VLS_StyleScopedClasses['label']} */ ;
        (__VLS_unwrap(name, {}));
        // @ts-ignore
        [name, art, art, art, art, iconStyle,];
        if (open.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                id: (__VLS_unwrap(tipId, {})),
                ref: "cardEl",
                role: "tooltip",
                ...{ class: "preview" },
                ...{ class: ({ above: __VLS_unwrap(above, {}) }) },
                ...{ style: (position.value ? { left: `${position.value.left}px`, top: `${position.value.top}px` } : { left: '0', top: '0', visibility: 'hidden' }) },
            });
            /** @type {__VLS_StyleScopedClasses['preview']} */ ;
            /** @type {__VLS_StyleScopedClasses['above']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "card" },
            });
            /** @type {__VLS_StyleScopedClasses['card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "head" },
            });
            /** @type {__VLS_StyleScopedClasses['head']} */ ;
            if (art.value) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "big-icon" },
                    ...{ style: (__VLS_unwrap(iconStyle, {})('44px')) },
                    'aria-hidden': "true",
                });
                /** @type {__VLS_StyleScopedClasses['big-icon']} */ ;
                if (art.value.kind === 'atlas') {
                    const __VLS_14 = AtlasSprite;
                    // @ts-ignore
                    const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
                        // @ts-ignore
                        frame: (art.value.frame),
                    }));
                    const __VLS_16 = __VLS_15({
                        frame: (art.value.frame),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                        src: (art.value.url),
                        alt: "",
                    });
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "text" },
            });
            /** @type {__VLS_StyleScopedClasses['text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({
                ...{ class: "title" },
            });
            /** @type {__VLS_StyleScopedClasses['title']} */ ;
            (__VLS_unwrap(name, {}));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "meta" },
            });
            /** @type {__VLS_StyleScopedClasses['meta']} */ ;
            (__VLS_unwrap(meta, {}));
            let __VLS_19;
            /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
            RouterLink;
            // @ts-ignore
            const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                // @ts-ignore
                to: (__VLS_unwrap(target, {})), ...{ class: "cta" },
            }));
            const __VLS_21 = __VLS_20({
                to: (__VLS_unwrap(target, {})),
                ...{ class: "cta" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_20));
            /** @type {__VLS_StyleScopedClasses['cta']} */ ;
            var __VLS_22;
            const { default: __VLS_24 } = __VLS_nonNull(__VLS_22.slots);
            (__VLS_unwrap(t, {})('docs.buildingLink.cta'));
            // @ts-ignore
            [name, target, open, tipId, art, art, art, art, iconStyle, above, position, position, position, meta, t,];
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
