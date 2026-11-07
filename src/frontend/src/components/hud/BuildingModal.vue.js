/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — this is the click half. Replaces the old
// instant-build-on-click in SettlementView.vue with the mockup's full-screen
// hex detail screen (Viking Realm.dc.html's `sel` overlay): art on the left,
// name/level/description/action on the right.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatBuildingModifier, formatBuildingOutput } from '../../lib/map/buildingStatsText';
import { buildingName, terrainName, resourceName, runeTypeName, runeRarityName } from '../../i18n/catalogueNames';
import { DEMO_MODE } from '../../config';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { FEAST_HOURS, feastCost, feastRenown } from '../../lib/economy/feasts';
import { formatCountdown } from '../../composables/useQueueOrders';
import { formatFullNumber } from '../../lib/hud/compactNumber';
import { useWorldStore } from '../../stores/world';
import { isOutsideRealm, secondsToNextLevelLoss, formatDecayWait } from '../../lib/map/realmDecay';
import { buildingStatsAt, scaleOutput, buildingUpgradeCost, SHRINE_BUILDING_TYPES, } from '../../lib/map/buildingEconomy';
const { defineProps, defineEmits, } = {};
const world = useWorldStore();
const { t, locale } = useI18n({ useScope: 'global' });
import { buildingArtOnTile, terrainArt } from '../../lib/map/buildingArt';
import { tileIsBuildable } from '../../lib/map/ringCatalogue';
import AtlasSprite from '../AtlasSprite.vue';
const props = defineProps();
const emit = defineEmits();
// Issue #53: shrine slots by level, mirroring ShrineCatalogue.Slots.cs.
function shrineSlotsFor(level) {
    const clamped = Math.min(Math.max(level, 1), 5);
    if (clamped >= 5)
        return 3;
    if (clamped >= 3)
        return 2;
    return 1;
}
// A building outside the realm has no function and loses levels (docs/design/economy.md section 5). The server marks it
// (`outsideRealmSince`); this window only shows the state, and offers nothing that state refuses (no upgrade, no runes, no feast).
const placedHere = computed(() => world.hud.buildings.find((b) => b.q === props.tile.q && b.r === props.tile.r));
const outsideRealm = computed(() => props.mine && !!props.tile.buildingType && isOutsideRealm(placedHere.value));
const isShrine = computed(() => SHRINE_BUILDING_TYPES.has(props.tile.buildingType ?? ''));
// Level 0 is the foundation stub while the shrine is still under
// construction (Enqueue) — it grants no favour and has no slots yet, mirrored
// by Settlement.SlotRune/ActiveEffect rejecting it backend-side.
const shrineBuilt = computed(() => (props.tile.buildingLevel ?? 0) >= 1);
const shrineSlots = computed(() => shrineSlotsFor(props.tile.buildingLevel ?? 1));
const slottedRunes = computed(() => world.hud.runes.filter((r) => r.slottedAtQ === props.tile.q && r.slottedAtR === props.tile.r));
// A rune slotted into a *different* shrine can't be slotted here too — only
// storage (slottedAtQ === null) is offered as a candidate for this shrine.
const storedRunes = computed(() => world.hud.runes.filter((r) => r.slottedAtQ === null));
const runeBusy = ref(false);
const runeError = ref(null);
async function slotHere(runeId) {
    runeBusy.value = true;
    runeError.value = null;
    try {
        await world.slotRuneLive(runeId, { q: props.tile.q, r: props.tile.r });
    }
    catch {
        runeError.value = t('hud.buildingModal.slotRuneError');
    }
    finally {
        runeBusy.value = false;
    }
}
async function unslot(runeId) {
    runeBusy.value = true;
    runeError.value = null;
    try {
        await world.unslotRuneLive(runeId);
    }
    catch {
        runeError.value = t('hud.buildingModal.unslotRuneError');
    }
    finally {
        runeBusy.value = false;
    }
}
// Town Square feast (economy.md section 6). Live worlds only: the local demo
// WorldModel has no renown, so demo mode shows the action but disabled, with
// the reason, rather than pretending to hold one.
const isTownSquare = computed(() => props.tile.buildingType === 'townsquare' && (props.tile.buildingLevel ?? 0) >= 1);
const feastOffer = computed(() => {
    const offer = world.hud.nextFeast;
    if (offer)
        return offer;
    const ts = props.tile.buildingLevel ?? 1;
    const each = feastCost(ts);
    return {
        townSquareLevel: ts,
        cost: { wood: each, stone: each, food: each, iron: 0 },
        durationSeconds: FEAST_HOURS * 3600,
        renownGain: feastRenown(ts),
    };
});
const feastCostLine = computed(() => ['wood', 'stone', 'food']
    .map((key) => `${Math.round(feastOffer.value.cost[key])} ${resourceName(key)}`)
    .join(' · '));
const feastHours = computed(() => Math.round(feastOffer.value.durationSeconds / 3600));
const runningFeast = computed(() => world.hud.feast);
const canAffordFeast = computed(() => ['wood', 'stone', 'food'].every((key) => world.hud.available[key] >= feastOffer.value.cost[key]));
const feastBusy = ref(false);
const feastError = ref(null);
// One-second ticker for the running feast's countdown.
const nowMs = ref(Date.now());
let feastTimer;
onMounted(() => {
    feastTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
    if (isTownSquare.value && props.mine && !DEMO_MODE)
        void world.loadRenownLive();
});
onBeforeUnmount(() => clearInterval(feastTimer));
const levelLossIn = computed(() => outsideRealm.value ? secondsToNextLevelLoss(placedHere.value, world.hud.queueFetchedAt, nowMs.value) : null);
const outsideRealmLine = computed(() => levelLossIn.value === null
    ? t('hud.buildingModal.outsideRealm')
    : t('hud.buildingModal.outsideRealmLosesIn', { time: formatDecayWait(levelLossIn.value, locale.value) }));
const feastRemaining = computed(() => {
    const f = runningFeast.value;
    if (!f || f.endsInSeconds === null)
        return null;
    return Math.max(0, f.endsInSeconds - (nowMs.value - world.hud.feastFetchedAt) / 1000);
});
// Renown progress towards the next settlement. Live worlds only: the demo has
// no renown, so nothing is shown there rather than invented numbers.
const renown = computed(() => (DEMO_MODE ? null : world.hud.renown));
const fmt = (value) => formatFullNumber(value, locale.value);
/** "13 d 6 h", "4 h 12 min", "12 min". */
function formatEta(seconds) {
    const totalMin = Math.max(1, Math.round(seconds / 60));
    const days = Math.floor(totalMin / 1440);
    const hours = Math.floor((totalMin % 1440) / 60);
    const minutes = totalMin % 60;
    if (days > 0)
        return t('hud.buildingModal.renownEtaDays', { days, hours });
    if (hours > 0)
        return t('hud.buildingModal.renownEtaHours', { hours, minutes });
    return t('hud.buildingModal.renownEtaMinutes', { minutes });
}
const renownProgress = computed(() => {
    const r = renown.value;
    if (!r)
        return null;
    const missing = Math.max(0, r.requiredForNextSettlement - r.total);
    const feastSeconds = runningFeast.value ? feastRemaining.value : null;
    const hasFeast = r.pendingFeastRenown > 0 && feastSeconds !== null;
    let eta = null;
    let etaWithFeast = null;
    if (!r.canFoundAnother && r.perHour > 0)
        eta = (missing / r.perHour) * 3600;
    if (!r.canFoundAnother && hasFeast) {
        const atFeast = r.total + (r.perHour * feastSeconds) / 3600;
        if (atFeast >= r.requiredForNextSettlement)
            etaWithFeast = eta;
        else if (atFeast + r.pendingFeastRenown >= r.requiredForNextSettlement)
            etaWithFeast = feastSeconds;
        else if (r.perHour > 0)
            etaWithFeast = ((missing - r.pendingFeastRenown) / r.perHour) * 3600;
    }
    return {
        fraction: r.requiredForNextSettlement > 0 ? Math.min(1, r.total / r.requiredForNextSettlement) : 1,
        missing,
        eta,
        etaWithFeast: hasFeast && etaWithFeast !== null && etaWithFeast !== eta ? etaWithFeast : null,
    };
});
const feastDisabledReason = computed(() => {
    if (DEMO_MODE)
        return t('hud.buildingModal.feastDemo');
    if (runningFeast.value)
        return t('hud.buildingModal.feastRunning');
    if (!canAffordFeast.value)
        return t('hud.buildingModal.notEnoughResources');
    return null;
});
async function holdFeast() {
    feastBusy.value = true;
    feastError.value = null;
    try {
        await world.holdFeastLive();
    }
    catch (err) {
        feastError.value = apiErrorMessage(err, t('hud.buildingModal.feastError'));
    }
    finally {
        feastBusy.value = false;
    }
}
const art = computed(() => {
    const { buildingType, buildingLevel, terrain } = props.tile;
    return (buildingType ? buildingArtOnTile(buildingType, buildingLevel ?? 1, props.tile) : undefined) ?? terrainArt(terrain);
});
// Open water is otherwise unbuildable, but a water building (fishing hut,
// dockyard, shrine of Njörd — see `isWaterOnlyBuilding`) already standing
// on a coastal-water tile still has to be inspectable/upgradeable here —
// this only ever sees such a tile with a building on it already (nothing in
// this modal's own `build` flow offers water as a target), so it can't be
// mistaken for turning open water buildable from empty.
const buildable = computed(() => tileIsBuildable(props.tile));
const name = computed(() => props.tile.buildingType ? buildingName(props.tile.buildingType) : terrainName(props.tile.terrain));
const sub = computed(() => {
    if (!props.tile.buildingType)
        return props.mine ? t('hud.buildingModal.subEmptyClaimed') : (props.ownerLabel ?? t('hud.buildingModal.subUnclaimed'));
    return props.ownerLabel ?? t('hud.buildingModal.subWildRuin');
});
const level = computed(() => props.tile.buildingLevel ?? 0);
// Same terrain-adjacency helper hoverInfoFor/buildingStats uses in
// HexMapRenderer.ts, so the modal's "current stats" match whatever the hover
// tooltip just showed.
const getTile = (q, r) => world.model.getTile(q, r);
// The existing building's current-level output/modifier — undefined
// (and hidden) for an empty tile, since there's nothing standing yet.
const buildingStats = computed(() => props.tile.buildingType ? buildingStatsAt(props.tile.buildingType, level.value, props.tile, getTile) : undefined);
const currentStats = computed(() => buildingStats.value
    ? {
        output: buildingStats.value.output
            ? formatBuildingOutput(scaleOutput(buildingStats.value.output, world.worldSpeedFactor), t)
            : undefined,
        modifier: buildingStats.value.modifier ? formatBuildingModifier(buildingStats.value.modifier, t) : undefined,
    }
    : undefined);
// Only an existing building has an action here (upgrade); a fresh build
// is placed from the ring menu, so an empty tile has no cost to show.
const upgradeLevel = computed(() => level.value + 1);
const upgradeCost = computed(() => props.tile.buildingType
    ? buildingUpgradeCost(props.tile.buildingType, upgradeLevel.value)
    : { wood: 0, stone: 0, food: 0, iron: 0 });
const costLine = computed(() => Object.keys(upgradeCost.value)
    .filter((key) => upgradeCost.value[key] > 0)
    .map((key) => `${upgradeCost.value[key]} ${resourceName(key)}`)
    .join(' · '));
// Issue #158: affordability is checked against `available` (stock minus
// what the waiting build queue has reserved), not raw stock — a reservation
// that could still be spent here would not be a reservation. Demo mode has
// no reservation concept (`hud.available` mirrors `hud.resources` there —
// see stores/world.ts), so this degrades to the old plain-stock check for
// free.
const canAfford = computed(() => Object.keys(upgradeCost.value).every((key) => world.hud.available[key] >= upgradeCost.value[key]));
// A hex already holding a waiting order (this settlement's premium queue,
// still on this same hex) shows a distinct "queued, no slot yet" state
// instead of a build/upgrade button — cancelling it is BuildQueuePanel's
// job, not this modal's.
const waitingOrderHere = computed(() => world.hud.queue.find((o) => o.q === props.tile.q && o.r === props.tile.r && o.state === 'waiting'));
// No free construction slot right now (every slot occupied by an
// already-building order) — for a premium account (a non-zero waiting
// queue), the action still submits, but as a waiting-queue request rather
// than an immediate build, so the button copy says so up front instead of
// surprising the player with a 409.
const noFreeSlot = computed(() => world.hud.construction.slotsUsed >= world.hud.construction.slots);
// No free slot *and* no waiting queue at all (`maxWaitingOrders === 0`
// doubles as "not premium" — see stores/world.ts's own comment on the
// field) — there is nothing this click could do but be rejected, so the
// button is disabled outright instead of only failing after the round trip.
const noSlotNoQueue = computed(() => noFreeSlot.value && world.hud.construction.maxWaitingOrders === 0);
const actionLabel = computed(() => {
    if (props.busy)
        return t('hud.buildingModal.queuing');
    if (noSlotNoQueue.value)
        return t('hud.buildingModal.noFreeSlotPremium');
    if (noFreeSlot.value)
        return t('hud.buildingModal.queueBuild');
    return t('hud.buildingModal.upgradeToLevel', { level: level.value + 1 });
});
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
    __VLS_withDotValue(art, {});
    __VLS_withDotValue(outsideRealm, {});
    __VLS_withDotValue(buildable, {});
    __VLS_withDotValue(currentStats, {});
    __VLS_withDotValue(isShrine, {});
    __VLS_withDotValue(shrineBuilt, {});
    __VLS_withDotValue(slottedRunes, {});
    __VLS_withDotValue(runeError, {});
    __VLS_withDotValue(storedRunes, {});
    __VLS_withDotValue(runeBusy, {});
    __VLS_withDotValue(isTownSquare, {});
    __VLS_withDotValue(feastOffer, {});
    __VLS_withDotValue(renown, {});
    __VLS_withDotValue(renownProgress, {});
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(runningFeast, {});
    __VLS_withDotValue(feastRemaining, {});
    __VLS_withDotValue(feastDisabledReason, {});
    __VLS_withDotValue(feastError, {});
    __VLS_withDotValue(feastBusy, {});
    __VLS_withDotValue(waitingOrderHere, {});
    __VLS_withDotValue(canAfford, {});
    __VLS_withDotValue(noSlotNoQueue, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['close']} */ ;
    /** @type {__VLS_StyleScopedClasses['stats']} */ ;
    /** @type {__VLS_StyleScopedClasses['stats']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['feast']} */ ;
    /** @type {__VLS_StyleScopedClasses['afford-note']} */ ;
    /** @type {__VLS_StyleScopedClasses['feast']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['runes-head']} */ ;
    /** @type {__VLS_StyleScopedClasses['rune-list']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    /** @type {__VLS_StyleScopedClasses['art-img']} */ ;
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('close'));
                // @ts-ignore
                [emit,];
            } },
        ...{ class: "backdrop" },
    });
    /** @type {__VLS_StyleScopedClasses['backdrop']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "modal panel" },
    });
    /** @type {__VLS_StyleScopedClasses['modal']} */ ;
    /** @type {__VLS_StyleScopedClasses['panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "art" },
    });
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    if (art.value?.kind === 'atlas') {
        const __VLS_0 = AtlasSprite;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            frame: (art.value.frame), ...{ class: "art-img" },
        }));
        const __VLS_2 = __VLS_1({
            frame: (art.value.frame),
            ...{ class: "art-img" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        /** @type {__VLS_StyleScopedClasses['art-img']} */ ;
    }
    else if (art.value?.kind === 'png') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
            ...{ class: "art-img" },
            src: (art.value.url),
            alt: "",
        });
        /** @type {__VLS_StyleScopedClasses['art-img']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "coord" },
    });
    /** @type {__VLS_StyleScopedClasses['coord']} */ ;
    (__VLS_unwrap(t, {})('hud.buildingModal.hexCoord', { q: __VLS_ctx.tile.q, r: __VLS_ctx.tile.r }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "name" },
    });
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    (__VLS_unwrap(name, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sub" },
    });
    /** @type {__VLS_StyleScopedClasses['sub']} */ ;
    (__VLS_unwrap(level, {}) > 0 ? __VLS_unwrap(t, {})('hud.buildingModal.levelSub', { level: __VLS_unwrap(level, {}), sub: __VLS_unwrap(sub, {}) }) : __VLS_unwrap(sub, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (__VLS_unwrap(emit, {})('close'));
                // @ts-ignore
                [emit, art, art, art, art, t, t, tile, tile, name, level, level, sub, sub,];
            } },
        ...{ class: "close" },
    });
    /** @type {__VLS_StyleScopedClasses['close']} */ ;
    (__VLS_unwrap(t, {})('hud.buildingModal.close'));
    if (outsideRealm.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc outside-realm" },
            'data-testid': "outside-realm",
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['outside-realm']} */ ;
        (__VLS_unwrap(outsideRealmLine, {}));
    }
    else if (!__VLS_ctx.mine && __VLS_ctx.tile.buildingType) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.descHeldByOther'));
    }
    else if (!__VLS_ctx.mine) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.descOutsideBorder'));
    }
    else if (!buildable.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.descOpenWater'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        (__VLS_ctx.tile.buildingType ? __VLS_unwrap(t, {})('hud.buildingModal.descUpgrade') : __VLS_unwrap(t, {})('hud.buildingModal.descBuildEmpty'));
    }
    if (!outsideRealm.value && currentStats.value && (currentStats.value.output || currentStats.value.modifier)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
            ...{ class: "stats" },
        });
        /** @type {__VLS_StyleScopedClasses['stats']} */ ;
        if (currentStats.value.output) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.hoverTooltip.output'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (currentStats.value.output);
        }
        if (currentStats.value.modifier) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
            (__VLS_unwrap(t, {})('hud.hoverTooltip.modifier'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
            (currentStats.value.modifier);
        }
    }
    if (isShrine.value && __VLS_ctx.mine && shrineBuilt.value && !outsideRealm.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "runes" },
        });
        /** @type {__VLS_StyleScopedClasses['runes']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "runes-head" },
        });
        /** @type {__VLS_StyleScopedClasses['runes-head']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.runesSlotted', { slotted: slottedRunes.value.length, total: __VLS_unwrap(shrineSlots, {}) }));
        if (runeError.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "rune-error" },
            });
            /** @type {__VLS_StyleScopedClasses['rune-error']} */ ;
            (runeError.value);
        }
        if (slottedRunes.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "rune-list" },
            });
            /** @type {__VLS_StyleScopedClasses['rune-list']} */ ;
            const __VLS_5 = __VLS_tryAsConstant((slottedRunes.value));
            for (const [rune] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (rune.id),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_unwrap(runeTypeName, {})(rune.type));
                (__VLS_unwrap(runeRarityName, {})(rune.rarity));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(isShrine.value && __VLS_ctx.mine && shrineBuilt.value && !outsideRealm.value))
                                throw 0;
                            if (!(slottedRunes.value.length))
                                throw 0;
                            return (unslot(rune.id));
                            // @ts-ignore
                            [t, t, t, t, t, t, t, t, t, tile, tile, outsideRealm, outsideRealm, outsideRealm, outsideRealmLine, mine, mine, mine, buildable, currentStats, currentStats, currentStats, currentStats, currentStats, currentStats, currentStats, isShrine, shrineBuilt, slottedRunes, slottedRunes, slottedRunes, shrineSlots, runeError, runeError, runeTypeName, runeRarityName,];
                        } },
                    ...{ class: "ghost" },
                    disabled: (runeBusy.value),
                });
                /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
                (__VLS_unwrap(t, {})('hud.buildingModal.unslot'));
                // @ts-ignore
                [t, runeBusy,];
            }
        }
        if (storedRunes.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "runes-head" },
            });
            /** @type {__VLS_StyleScopedClasses['runes-head']} */ ;
            (__VLS_unwrap(t, {})('hud.buildingModal.inStorage'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                ...{ class: "rune-list" },
            });
            /** @type {__VLS_StyleScopedClasses['rune-list']} */ ;
            const __VLS_6 = __VLS_tryAsConstant((storedRunes.value));
            for (const [rune] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (rune.id),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_unwrap(runeTypeName, {})(rune.type));
                (__VLS_unwrap(runeRarityName, {})(rune.rarity));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(isShrine.value && __VLS_ctx.mine && shrineBuilt.value && !outsideRealm.value))
                                throw 0;
                            if (!(storedRunes.value.length))
                                throw 0;
                            return (slotHere(rune.id));
                            // @ts-ignore
                            [t, runeTypeName, runeRarityName, storedRunes, storedRunes,];
                        } },
                    ...{ class: "ghost" },
                    disabled: (runeBusy.value || slottedRunes.value.length >= __VLS_unwrap(shrineSlots, {})),
                });
                /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
                (__VLS_unwrap(t, {})('hud.buildingModal.slotHere'));
                // @ts-ignore
                [t, slottedRunes, shrineSlots, runeBusy,];
            }
        }
    }
    if (isTownSquare.value && __VLS_ctx.mine && !outsideRealm.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "feast" },
            'data-testid': "feast",
        });
        /** @type {__VLS_StyleScopedClasses['feast']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "runes-head" },
        });
        /** @type {__VLS_StyleScopedClasses['runes-head']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.feastTitle'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc feast-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['feast-desc']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.feastDesc'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dl, __VLS_intrinsics.dl)({
            ...{ class: "stats" },
        });
        /** @type {__VLS_StyleScopedClasses['stats']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        (__VLS_unwrap(t, {})('hud.buildingModal.feastCost'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
            'data-testid': "feast-cost",
        });
        (__VLS_unwrap(feastCostLine, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        (__VLS_unwrap(t, {})('hud.buildingModal.feastDuration'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({});
        (__VLS_unwrap(t, {})('hud.buildingModal.feastHours', { hours: __VLS_unwrap(feastHours, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dt, __VLS_intrinsics.dt)({});
        (__VLS_unwrap(t, {})('hud.buildingModal.feastGain'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.dd, __VLS_intrinsics.dd)({
            'data-testid': "feast-gain",
        });
        (__VLS_unwrap(t, {})('hud.buildingModal.feastRenown', { renown: Math.round(feastOffer.value.renownGain) }));
        if (renown.value && renownProgress.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "renown-progress" },
                'data-testid': "renown-progress",
            });
            /** @type {__VLS_StyleScopedClasses['renown-progress']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "renown-line" },
                'data-testid': "renown-line",
            });
            /** @type {__VLS_StyleScopedClasses['renown-line']} */ ;
            (__VLS_unwrap(t, {})('hud.buildingModal.renownProgress', {
                total: __VLS_unwrap(fmt, {})(renown.value.total),
                required: __VLS_unwrap(fmt, {})(renown.value.requiredForNextSettlement),
                n: renown.value.settlementCount + 1,
            }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "renown-bar" },
                role: "progressbar",
                'aria-valuenow': (Math.round(renownProgress.value.fraction * 100)),
                'aria-valuemin': "0",
                'aria-valuemax': "100",
            });
            /** @type {__VLS_StyleScopedClasses['renown-bar']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div)({
                ...{ class: "renown-bar-fill" },
                ...{ style: ({ width: `${renownProgress.value.fraction * 100}%` }) },
            });
            /** @type {__VLS_StyleScopedClasses['renown-bar-fill']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "desc" },
                'data-testid': "renown-rate",
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            (__VLS_unwrap(t, {})('hud.buildingModal.renownRate', { rate: __VLS_unwrap(fmt, {})(renown.value.perHour) }));
            if (renown.value.canFoundAnother) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "desc" },
                    'data-testid': "renown-enough",
                });
                /** @type {__VLS_StyleScopedClasses['desc']} */ ;
                (__VLS_unwrap(t, {})('hud.buildingModal.renownEnough'));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "desc" },
                    'data-testid': "renown-missing",
                });
                /** @type {__VLS_StyleScopedClasses['desc']} */ ;
                (__VLS_unwrap(t, {})('hud.buildingModal.renownMissing', { missing: __VLS_unwrap(fmt, {})(renownProgress.value.missing) }));
                if (renownProgress.value.eta !== null) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "desc" },
                        'data-testid': "renown-eta",
                    });
                    /** @type {__VLS_StyleScopedClasses['desc']} */ ;
                    (__VLS_unwrap(t, {})('hud.buildingModal.renownEta', { time: formatEta(renownProgress.value.eta) }));
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "desc" },
                        'data-testid': "renown-eta",
                    });
                    /** @type {__VLS_StyleScopedClasses['desc']} */ ;
                    (__VLS_unwrap(t, {})('hud.buildingModal.renownNoRate'));
                }
                if (renownProgress.value.etaWithFeast !== null) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "desc" },
                        'data-testid': "renown-eta-feast",
                    });
                    /** @type {__VLS_StyleScopedClasses['desc']} */ ;
                    (__VLS_unwrap(t, {})('hud.buildingModal.renownEtaFeast', { time: formatEta(renownProgress.value.etaWithFeast) }));
                }
            }
        }
        else if (DEMO_MODE.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "desc" },
                'data-testid': "renown-demo",
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            (__VLS_unwrap(t, {})('hud.buildingModal.renownDemo'));
        }
        if (runningFeast.value && !DEMO_MODE.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "feast-running" },
                'data-testid': "feast-countdown",
            });
            /** @type {__VLS_StyleScopedClasses['feast-running']} */ ;
            (feastRemaining.value === null
                ? __VLS_unwrap(t, {})('hud.buildingModal.feastPaused')
                : __VLS_unwrap(t, {})('hud.buildingModal.feastEndsIn', { time: __VLS_unwrap(formatCountdown, {})(feastRemaining.value), renown: Math.round(runningFeast.value.renownGain) }));
        }
        if (feastDisabledReason.value && !runningFeast.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "desc afford-note" },
                'data-testid': "feast-reason",
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            /** @type {__VLS_StyleScopedClasses['afford-note']} */ ;
            (feastDisabledReason.value);
        }
        if (feastError.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "desc afford-note" },
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            /** @type {__VLS_StyleScopedClasses['afford-note']} */ ;
            (feastError.value);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (holdFeast) },
            ...{ class: "primary" },
            'data-testid': "feast-button",
            disabled: (feastBusy.value || !!feastDisabledReason.value),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.feastAction'));
    }
    if (__VLS_ctx.mine && buildable.value && waitingOrderHere.value && !outsideRealm.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "actions" },
        });
        /** @type {__VLS_StyleScopedClasses['actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "desc queued-note" },
        });
        /** @type {__VLS_StyleScopedClasses['desc']} */ ;
        /** @type {__VLS_StyleScopedClasses['queued-note']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.queuedNote'));
    }
    else if (__VLS_ctx.mine && buildable.value && __VLS_ctx.tile.buildingType && !outsideRealm.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "actions" },
        });
        /** @type {__VLS_StyleScopedClasses['actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cost" },
        });
        /** @type {__VLS_StyleScopedClasses['cost']} */ ;
        (__VLS_unwrap(t, {})('hud.buildingModal.upgradeCost'));
        (__VLS_unwrap(costLine, {}));
        if (!canAfford.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "desc afford-note" },
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            /** @type {__VLS_StyleScopedClasses['afford-note']} */ ;
            (__VLS_unwrap(t, {})('hud.buildingModal.notEnoughResources'));
        }
        if (noSlotNoQueue.value) {
            let __VLS_7;
            /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
            i18nT;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                // @ts-ignore
                keypath: "hud.buildingModal.premiumRequired", tag: "p", ...{ class: "desc afford-note" },
            }));
            const __VLS_9 = __VLS_8({
                keypath: "hud.buildingModal.premiumRequired",
                tag: "p",
                ...{ class: "desc afford-note" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            /** @type {__VLS_StyleScopedClasses['afford-note']} */ ;
            var __VLS_10;
            const { default: __VLS_12 } = __VLS_nonNull(__VLS_10.slots);
            {
                const { premium: __VLS_13 } = __VLS_nonNull(__VLS_10.slots);
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (__VLS_unwrap(t, {})('hud.buildingModal.premium'));
                // @ts-ignore
                [t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, t, tile, outsideRealm, outsideRealm, outsideRealm, mine, mine, mine, buildable, buildable, isTownSquare, feastCostLine, feastHours, feastOffer, renown, renown, renown, renown, renown, renown, renownProgress, renownProgress, renownProgress, renownProgress, renownProgress, renownProgress, renownProgress, renownProgress, fmt, fmt, fmt, fmt, DEMO_MODE, DEMO_MODE, runningFeast, runningFeast, runningFeast, feastRemaining, feastRemaining, formatCountdown, feastDisabledReason, feastDisabledReason, feastDisabledReason, feastError, feastError, feastBusy, waitingOrderHere, costLine, canAfford, noSlotNoQueue,];
            }
            // @ts-ignore
            [];
        }
        if (__VLS_ctx.error) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "desc afford-note" },
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            /** @type {__VLS_StyleScopedClasses['afford-note']} */ ;
            (__VLS_ctx.error);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(__VLS_ctx.mine && buildable.value && waitingOrderHere.value && !outsideRealm.value))
                        throw 0;
                    if (!(__VLS_ctx.mine && buildable.value && __VLS_ctx.tile.buildingType && !outsideRealm.value))
                        throw 0;
                    return (__VLS_unwrap(emit, {})('upgrade'));
                    // @ts-ignore
                    [emit, error, error,];
                } },
            ...{ class: "primary" },
            disabled: (__VLS_ctx.busy || !canAfford.value || noSlotNoQueue.value),
        });
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        (__VLS_unwrap(actionLabel, {}));
    }
    // @ts-ignore
    [canAfford, noSlotNoQueue, busy, actionLabel,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
