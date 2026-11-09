// The guided landing-page checklist's decision logic, kept out of
// LandingView.vue (which mounts a real Pixi renderer and so has no test
// file of its own — see LandingView.vue's own comments) so the actual
// "what step are we on / what's done" contract can be asserted directly,
// the same way ringLayout.ts's geometry is tested apart from RingMenu.vue.
import { hexDistance, hexesInRadius } from '../hex/coords';
export const GUIDED_BUILD_TYPES = ['reindeerherder', 'lumberjack'];
const TOTAL_STEPS = 1 + GUIDED_BUILD_TYPES.length;
/**
 * Derives the checklist purely from what's actually standing
 * (`WorldModel.listPlacedBuildings`, surfaced as `hud.placedBuildingTypes`)
 * rather than a separately tracked step counter that could drift from the
 * real build order. The ring only requires the clicked tile's terrain to
 * match a guided type (grass -> reindeerherder, forest -> lumberjack), so the player
 * can place either one first — a row is "done" the moment its type appears
 * anywhere in `placedTypes`, regardless of order.
 */
export function deriveOnboardingGuidance(hasFounded, placedTypes) {
    const placed = new Set(placedTypes);
    const rows = [
        { key: 'longhouse', state: hasFounded ? 'done' : 'upcoming' },
        ...GUIDED_BUILD_TYPES.map((type) => ({
            key: type,
            state: (placed.has(type) ? 'done' : 'upcoming'),
        })),
    ];
    // Exactly one row reads "current": the first not-yet-done row, if any.
    const firstUpcoming = rows.findIndex((row) => row.state !== 'done');
    if (firstUpcoming !== -1)
        rows[firstUpcoming] = { ...rows[firstUpcoming], state: 'current' };
    const doneCount = rows.filter((row) => row.state === 'done').length;
    const complete = doneCount === TOTAL_STEPS;
    return {
        step: Math.min(doneCount + 1, TOTAL_STEPS),
        totalSteps: TOTAL_STEPS,
        progress: doneCount / TOTAL_STEPS,
        complete,
        rows,
    };
}
/**
 * Which guided building type the next-step pointer (GuidancePointer.vue)
 * should aim the player at — the first not-yet-placed guided type, or
 * `null` once both are done (or before founding, when there's nothing to
 * point at on the ring yet).
 */
export function nextGuidedType(placedTypes) {
    const placed = new Set(placedTypes);
    return GUIDED_BUILD_TYPES.find((type) => !placed.has(type)) ?? null;
}
/**
 * The terrain each guided building stands on - only used to pick the hex the map pointer aims at and to name that
 * terrain in its label. It never enables or disables a ring entry: the ring offers what the map's placement filter does.
 */
export const GUIDED_BUILD_TERRAIN = {
    reindeerherder: 'grass',
    lumberjack: 'forest',
};
/**
 * The nearest still-buildable hex for the next guided building — what the
 * map pointer (GuidancePointer.vue) aims at for the "now build here" /
 * "one more — the {terrain}" steps. `isBuildable` should already cover
 * ownership/emptiness (the caller mirrors LandingView's own onHexClick
 * rules); this adds the terrain filter and picks the closest match to
 * `center` so the pointer suggests a hex right next to the longhouse
 * rather than an arbitrary one out at the edge of the claim. Terrain and
 * buildability are injected as callbacks (not a WorldModel import) so this
 * stays a pure function, testable the same way the rest of this module is.
 */
export function findGuidedTarget(center, radius, type, terrainAt, isBuildable) {
    const wanted = GUIDED_BUILD_TERRAIN[type];
    let best = null;
    let bestDist = Infinity;
    for (const c of hexesInRadius(center, radius)) {
        if (terrainAt(c) !== wanted || !isBuildable(c))
            continue;
        const d = hexDistance(center, c);
        if (d < bestDist) {
            best = c;
            bestDist = d;
        }
    }
    return best;
}
/**
 * landing-page-defects.md L6a: a live-mode click that misses every offered
 * plot (`world.startPositionAt` returned null) but lands within one hex of
 * exactly one of them founds there instead of refusing the click outright.
 * Six offered plots among ~150 drawn tiles (L3) is a small target, and a
 * near-miss reads as "the player clearly meant this one" far more often than
 * "the player meant open sea" — but only for an unambiguous near-miss:
 * deliberately conservative, distance 1 only (not "nearest offered plot at
 * any distance", which would silently redirect clicks a long way from where
 * they landed — the same reasoning issue #96 already established for the
 * exact-match rule this sits next to, see `startPositionAt`'s own comment),
 * and only when a single offered plot is that close. Two plots equidistant
 * at distance 1 means genuine ambiguity — this returns `null` rather than
 * guessing, and the caller falls back to the ordinary miss handling (nudge
 * copy + `pulseAttention()`).
 */
export function snapToOfferedPlot(clicked, offered) {
    const adjacent = offered.filter((plot) => hexDistance(clicked, plot) === 1);
    return adjacent.length === 1 ? adjacent[0] : null;
}
/**
 * Where the pointer goes inside the open ring for the next guided building: the Build hub first, then the category
 * that holds it, then its own bubble - whichever of them the ring is showing right now (`spots` has the bubbles on
 * screen, by id). Null when the building is not offered on the clicked hex, so the caller points at the map instead.
 */
export function guidedRingStep(type, categories, spots) {
    const category = categories.find((c) => c.buildings.some((b) => b.id === type));
    if (!category)
        return null;
    if (spots[type])
        return { kind: 'building', id: type, spot: spots[type] };
    if (spots[category.id])
        return { kind: 'category', id: category.id, spot: spots[category.id] };
    if (spots.build)
        return { kind: 'build', spot: spots.build };
    return null;
}
