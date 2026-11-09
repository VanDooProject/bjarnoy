/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #16 "better hover": "hover on tiles should have more info and
// square edges" — matches the mockup's "Crop farm LEVEL 2 / Output +72
// food/h / CLICK TO OPEN" card (the mockup's "Workers 8/8" line is gone: the backend has no workers). `info.stats` is optional —
// non-building tiles just render title/subtitle/stat as before. See
// HoverInfo's doc comment in HexMapRenderer.ts for how those numbers are
// derived; this component is the only place they're formatted/translated,
// since HexMapRenderer.ts is a plain renderer class with no i18n access.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatBuildingModifier, formatBuildingOutput } from '../../lib/map/buildingStatsText';
import { scaleOutput } from '../../lib/map/buildingEconomy';
import { useWorldStore } from '../../stores/world';
import { buildingName, terrainName, wastedTerrainName, giantName, campName, beastName, endgameName } from '../../i18n/catalogueNames';
const { defineProps, } = {};
// Mirrors textures.ts's WASTED_TEXTURE_KEY (grass/forest/sand -> their
// wasted-island art family) plus the coastal case (sea bordering wasted
// land renders as blacksandcoast — see WorldModel.getTile's own `wasted`
// tagging, which only ever sets it on sea when that sea is coastal).
// Mountain has no dedicated wasted family, so it isn't listed here either.
const WASTED_TERRAIN_LABEL_KEY = {
    grass: 'wasteland',
    forest: 'deadforest',
    sand: 'blacksand',
    sea: 'blacksandcoast',
};
const world = useWorldStore();
const props = defineProps();
const { t, d } = useI18n({ useScope: 'global' });
// screenX is already anchored at the hovered tile's own right edge
// (HexMapRenderer.hoverInfoFor), so only a small fixed margin is needed
// here — the tile-width offset itself lives in world space and scales
// with zoom on its own.
// Positioned with a transform, not left/top: the tooltip jumps to a new
// spot on every hex change, and a left/top move is a layout change that
// repainted the whole page above the WebGL map each time — on a real GPU
// that showed as short white rectangles flashing beside the cursor.
// A transform only moves the tooltip's own compositor layer.
const style = computed(() => ({
    transform: `translate(${props.info.screenX + 12}px, ${props.info.screenY}px) translateY(-50%)`,
}));
const title = computed(() => {
    const subject = props.info.subject;
    if (subject.kind === 'building')
        return buildingName(subject.buildingType);
    if (subject.kind === 'giant')
        return giantName(subject.family);
    if (subject.kind === 'camp')
        return campName(subject.family);
    if (subject.kind === 'utgardwall')
        return endgameName(subject.gate ? 'utgardgate' : 'utgardwall');
    if (subject.kind === 'jotuntower')
        return endgameName('jotunwatchtower');
    if (subject.isRiver)
        return t('hud.hoverTooltip.river');
    if (subject.wasted) {
        const key = WASTED_TERRAIN_LABEL_KEY[subject.terrain];
        if (key)
            return wastedTerrainName(key);
    }
    return terrainName(subject.terrain);
});
const level = computed(() => {
    const subject = props.info.subject;
    return subject.kind === 'building' || subject.kind === 'camp' ? subject.level : undefined;
});
const subtitle = computed(() => {
    const owner = props.info.owner;
    if (!owner)
        return undefined;
    return owner.mine ? owner.settlementName : t('hud.hoverTooltip.ownedByOther', { owner: owner.ownerName, name: owner.settlementName });
});
// Only shown for a non-building tile without a level badge — matches the
// old "stat" line ("Click to build here" / "Claimed ground" / "Unclaimed").
const stat = computed(() => {
    const subject = props.info.subject;
    if (subject.kind === 'building')
        return undefined;
    // A wildlife camp: not buildable, so no "click to build" line — say how strong it is.
    if (subject.kind === 'camp')
        return subject.strong ? t('hud.hoverTooltip.campStrong') : t('hud.hoverTooltip.campWeak');
    // An endgame site is not buildable either: say what state it is in.
    if (subject.kind === 'utgardwall')
        return t(`hud.hoverTooltip.wallLevel${Math.min(Math.max(subject.level, 0), 2)}`);
    if (subject.kind === 'jotuntower')
        return t(`hud.hoverTooltip.towerLevel${Math.min(Math.max(subject.level, 0), 2)}`);
    const owner = props.info.owner;
    if (!owner)
        return t('hud.hoverTooltip.unclaimed');
    return owner.mine ? t('hud.hoverTooltip.clickToBuildHere') : t('hud.hoverTooltip.claimedGround');
});
// A wildlife camp's live state: garrison per tier with the beasts' names, then whether it is empty,
// calm until some time, or aggressive, and how often it was cleared. Absent in demo mode.
const campLines = computed(() => {
    const subject = props.info.subject;
    if (subject.kind !== 'camp' || !subject.live)
        return [];
    const live = subject.live;
    const lines = ['young', 'adult', 'alpha']
        .filter((tier) => live.fullGarrison[tier] > 0)
        .map((tier) => `${beastName(subject.family, tier)} ${live.garrison[tier]} / ${live.fullGarrison[tier]}`);
    const calm = live.calmUntil && Date.parse(live.calmUntil) > Date.now() ? live.calmUntil : null;
    if (live.empty)
        lines.push(t('hud.hoverTooltip.campEmpty'));
    else if (calm)
        lines.push(t('hud.hoverTooltip.campCalmUntil', { time: d(new Date(calm), 'long') }));
    else if (subject.strong && live.aggressive)
        lines.push(t('hud.hoverTooltip.campAggressive'));
    if (live.clears > 0)
        lines.push(t('hud.hoverTooltip.campClears', { count: live.clears }, live.clears));
    return lines;
});
// A bridge shows what its level does to a crossing army, to everyone (its stats are otherwise the owner's alone), and for the guarded
// one whether the viewer's armies may cross. Words only, no path costs (the "slower/quicker" convention of the walls docs).
const bridgeLevel = computed(() => {
    const subject = props.info.subject;
    return subject.kind === 'building' && subject.buildingType === 'bridge' ? Math.min(Math.max(subject.level, 0), 4) : undefined;
});
const bridgeText = computed(() => (bridgeLevel.value === undefined ? undefined : t(`hud.hoverTooltip.bridgeLevel${bridgeLevel.value}`)));
const bridgeAccessText = computed(() => {
    if (bridgeLevel.value !== 4)
        return undefined;
    const owner = props.info.owner;
    if (owner?.mine)
        return t('hud.hoverTooltip.bridgeAccessOwner');
    if (owner?.ownerId && props.friendOwners?.has(owner.ownerId))
        return t('hud.hoverTooltip.bridgeAccessFriend');
    return t('hud.hoverTooltip.bridgeAccessClosed');
});
const outputText = computed(() => props.info.stats?.output ? formatBuildingOutput(scaleOutput(props.info.stats.output, world.worldSpeedFactor), t) : undefined);
const modifierText = computed(() => props.info.stats?.modifier && props.info.stats.modifier.kind !== 'bridge' ? formatBuildingModifier(props.info.stats.modifier, t) : undefined);
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
    __VLS_withDotValue(level, {});
    __VLS_withDotValue(subtitle, {});
    __VLS_withDotValue(stat, {});
    __VLS_withDotValue(campLines, {});
    __VLS_withDotValue(outputText, {});
    __VLS_withDotValue(modifierText, {});
    __VLS_withDotValue(bridgeText, {});
    __VLS_withDotValue(bridgeAccessText, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['stats']} */ ;
    /** @type {__VLS_StyleScopedClasses['stats']} */ ;
    /** @type {__VLS_StyleScopedClasses['premium-gate']} */ ;
    /** @type {__VLS_StyleScopedClasses['premium-gate']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hex-tooltip panel" },
        ...{ style: (__VLS_unwrap(style, {})) },
    });
    /** @type {__VLS_StyleScopedClasses['hex-tooltip']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "title-row" },
    });
    /** @type {__VLS_StyleScopedClasses['title-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "title" },
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_unwrap(title, {}));
    if (level.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "level" },
        });
        /** @type {__VLS_StyleScopedClasses['level']} */ ;
        (__VLS_unwrap(t, {})('hud.hoverTooltip.level', { level: level.value }));
    }
    if (subtitle.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "subtitle" },
        });
        /** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
        (subtitle.value);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
        ...{ class: "separator" },
    });
    /** @type {__VLS_StyleScopedClasses['separator']} */ ;
    if (stat.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "stat" },
        });
        /** @type {__VLS_StyleScopedClasses['stat']} */ ;
        (stat.value);
    }
    if (campLines.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "camp-lines" },
            'data-testid': "camp-lines",
        });
        /** @type {__VLS_StyleScopedClasses['camp-lines']} */ ;
        const __VLS_0 = __VLS_tryAsConstant((campLines.value));
        for (const [line] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                key: (line),
            });
            (line);
            // @ts-ignore
            [style, title, level, level, t, subtitle, subtitle, stat, stat, campLines, campLines,];
        }
    }
    if (outputText.value || modifierText.value || bridgeText.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
            ...{ class: "stats" },
        });
        /** @type {__VLS_StyleScopedClasses['stats']} */ ;
        if (outputText.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.hoverTooltip.output'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (outputText.value);
        }
        if (modifierText.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.hoverTooltip.modifier'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (modifierText.value);
        }
        if (bridgeText.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.hoverTooltip.crossing'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
                'data-testid': "bridge-crossing",
            });
            (bridgeText.value);
        }
        if (bridgeAccessText.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
                'data-testid': "bridge-access",
            });
            (bridgeAccessText.value);
        }
    }
    if (__VLS_ctx.info.premiumLocked) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "premium-gate" },
        });
        /** @type {__VLS_StyleScopedClasses['premium-gate']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "lock" },
        });
        /** @type {__VLS_StyleScopedClasses['lock']} */ ;
        (__VLS_unwrap(t, {})('hud.hoverTooltip.lockIcon'));
        let __VLS_1;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            keypath: "hud.hoverTooltip.premiumGate", tag: "span",
        }));
        const __VLS_3 = __VLS_2({
            keypath: "hud.hoverTooltip.premiumGate",
            tag: "span",
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        var __VLS_4;
        const { default: __VLS_6 } = __VLS_nonNull(__VLS_4.slots);
        {
            const { premium: __VLS_7 } = __VLS_nonNull(__VLS_4.slots);
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_unwrap(t, {})('hud.hoverTooltip.premium'));
            // @ts-ignore
            [t, t, t, t, t, outputText, outputText, outputText, modifierText, modifierText, modifierText, bridgeText, bridgeText, bridgeText, bridgeAccessText, bridgeAccessText, info,];
        }
        // @ts-ignore
        [];
    }
    if (__VLS_ctx.info.openable) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cta" },
        });
        /** @type {__VLS_StyleScopedClasses['cta']} */ ;
        (__VLS_unwrap(t, {})('hud.hoverTooltip.clickToOpen'));
    }
    // @ts-ignore
    [t, info,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
