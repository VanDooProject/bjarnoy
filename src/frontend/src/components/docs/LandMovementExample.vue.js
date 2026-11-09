/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The Land movement docs page's example map: a small hand-placed island with a dummy army's route over it, drawn by the game's own
// HexMapRenderer through a StaticWorldModel (like BogIsland.vue and WallExample.vue), with the realm claimed by the model itself. The route is the one the real pathfinder finds
// (lib/docs/landMovementExample.ts) and is drawn by the renderer's army overlay, the same line and flag a marching army gets on the
// map. Hovering a hex names it. Below the map every hex of the route is listed in a table with the time a Spearman spends on it;
// hovering a row (or tapping it) highlights its hex on the map, and hovering a hex on the map marks its row.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDocsMapRenderer } from '../../composables/useDocsMapRenderer';
import DocsMapControls from './DocsMapControls.vue';
import { coordKey } from '../../lib/hex/coords';
import { LAND_EXAMPLE_PLAYER, LAND_EXAMPLE_START, buildLandExampleTiles, landExampleContext, landExampleKindOf, landExampleRoute, landExampleWorld, } from '../../lib/docs/landMovementExample';
import { formatMinutes, minutesPerHex } from '../../lib/docs/landMovementDocs';
import { buildingName, terrainName, unitName } from '../../i18n/catalogueNames';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
const { t, locale } = useI18n({ useScope: 'global' });
const units = useUnitCatalogueStore();
const world = landExampleWorld();
const tiles = buildLandExampleTiles(world);
const ctx = landExampleContext(tiles);
const route = landExampleRoute(tiles);
const TERRAINS = new Set(['grass', 'forest', 'bog', 'mountain', 'sand']);
function kindName(kind) {
    if (kind === 'tower')
        return buildingName('tower');
    return TERRAINS.has(kind) ? terrainName(kind) : t(`docs.landMovement.example.names.${kind}`);
}
const hovered = ref(null);
const container = ref(null);
const canvas = ref(null);
const { renderer, zoomIn, zoomOut, wheelHint } = useDocsMapRenderer(canvas, container, {
    worldModel: world,
    playerId: LAND_EXAMPLE_PLAYER,
    previewCenter: { q: 2, r: 0 },
    onHoverChange: (info) => {
        hovered.value = info;
    },
});
// The army's flag at its settlement and the route it takes, as the renderer draws a selected army's route.
watch(renderer, (r) => r?.setArmyOverlay({
    armies: [{ id: 'docs', position: LAND_EXAMPLE_START, selected: true, returning: false, isFleet: false }],
    route: route.path,
    draftWaypoints: [],
}), { immediate: true });
// Two sources mark a hex: the map's pointer (hoveredKey) and the table (selectedKey, from a row's hover or tap). The table wins.
// pinnedKey is the row a tap fixed, so the mouseleave a touch device emulates does not undo it.
const selectedKey = ref(null);
const pinnedKey = ref(null);
const hoveredKey = computed(() => (hovered.value ? coordKey(hovered.value.coord) : null));
const activeKey = computed(() => selectedKey.value ?? hoveredKey.value);
function nameAt(coord) {
    const { q, r } = coord;
    const tile = world.getTile(q, r);
    const river = world.getRiverTile(q, r);
    return kindName(landExampleKindOf(tile, river, ctx.isWideRiver(coord)));
}
const hoverText = computed(() => {
    const info = hovered.value;
    if (info)
        return nameAt(info.coord);
    const step = route.hexes.find((s) => coordKey(s.coord) === selectedKey.value);
    return step ? nameAt(step.coord) : t('docs.landMovement.example.hoverHint');
});
function selectRow(coord) {
    selectedKey.value = coordKey(coord);
    renderer.value?.setHighlight(coord);
}
/** The pointer left the table: back to the tapped row if there is one, else no row. */
function clearRow() {
    const pinned = route.hexes.find((s) => coordKey(s.coord) === pinnedKey.value);
    selectedKey.value = pinned ? pinnedKey.value : null;
    renderer.value?.setHighlight(pinned?.coord);
}
function tapRow(coord) {
    const key = coordKey(coord);
    if (pinnedKey.value === key) {
        pinnedKey.value = null;
        clearRow();
        return;
    }
    pinnedKey.value = key;
    selectRow(coord);
}
const speed = computed(() => units.byType.spearman?.speed ?? 0);
const lang = computed(() => String(locale.value));
const rows = computed(() => route.hexes.map((s) => ({
    key: coordKey(s.coord),
    coord: s.coord,
    name: kindName(s.kind),
    time: speed.value ? formatMinutes(minutesPerHex(s.cost, speed.value), lang.value) : '',
})));
const total = computed(() => (speed.value ? formatMinutes(minutesPerHex(route.total, speed.value), lang.value) : ''));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(activeKey, {});
    __VLS_withDotValue(total, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "land-example" },
        'data-testid': "land-example",
    });
    /** @type {__VLS_StyleScopedClasses['land-example']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "container",
        ...{ class: "map-host" },
    });
    /** @type {__VLS_StyleScopedClasses['map-host']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.canvas)({
        ref: "canvas",
        ...{ class: "docs-map-canvas" },
        role: "img",
        'aria-label': (__VLS_ctx.$t('docs.landMovement.example.alt')),
    });
    /** @type {__VLS_StyleScopedClasses['docs-map-canvas']} */ ;
    const __VLS_0 = DocsMapControls;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        zoomIn: (__VLS_unwrap(zoomIn, {})), zoomOut: (__VLS_unwrap(zoomOut, {})), wheelHint: (__VLS_unwrap(wheelHint, {})),
    }));
    const __VLS_2 = __VLS_1({
        zoomIn: (__VLS_unwrap(zoomIn, {})),
        zoomOut: (__VLS_unwrap(zoomOut, {})),
        wheelHint: (__VLS_unwrap(wheelHint, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "caption" },
        'data-testid': "land-example-caption",
    });
    /** @type {__VLS_StyleScopedClasses['caption']} */ ;
    (__VLS_unwrap(hoverText, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "steps" },
        'data-testid': "land-example-steps",
    });
    /** @type {__VLS_StyleScopedClasses['steps']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "num" },
    });
    /** @type {__VLS_StyleScopedClasses['num']} */ ;
    (__VLS_ctx.$t('docs.landMovement.example.columns.step'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.landMovement.example.columns.hex'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.$t('docs.landMovement.example.columns.time'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({
        ...{ onMouseleave: (clearRow) },
    });
    const __VLS_5 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
    for (const [s, i] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            ...{ onMouseenter: (...[$event]) => {
                    void $event;
                    return (selectRow(s.coord));
                    // @ts-ignore
                    [$t, $t, $t, $t, zoomIn, zoomOut, wheelHint, hoverText, rows,];
                } },
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (tapRow(s.coord));
                    // @ts-ignore
                    [];
                } },
            key: (s.key),
            'data-step': (i + 1),
            ...{ class: ({ active: s.key === activeKey.value }) },
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "num" },
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        (i + 1);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (s.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (s.time);
        // @ts-ignore
        [activeKey,];
    }
    if (total.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tfoot, __VLS_intrinsics.tfoot)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            'data-testid': "land-example-total",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "3",
        });
        (__VLS_ctx.$t('docs.landMovement.example.total', { unit: __VLS_unwrap(unitName, {})('spearman'), time: total.value }));
    }
    // @ts-ignore
    [$t, total, total, unitName,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
