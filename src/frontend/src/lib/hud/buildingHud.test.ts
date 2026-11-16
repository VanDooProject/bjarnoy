import { describe, expect, it } from 'vitest';
import type { BuildingDefinitionResponse, BuildOrderResponse, TrainingOrderResponse } from '../../api/types';
import {
  HUD_BOX_FONT_PX,
  HUD_TIER,
  affordableInSeconds,
  ageViewModel,
  buildingHudViewModel,
  hudMarkerKeys,
  markerBoxRect,
  markerScale,
  pointInRect,
  rowsSignature,
  rowsFor,
  stackOrder,
  tierFor,
  type BuildingHudInput,
  type HudRow,
} from './buildingHud';
import { DIAL_FINISH_MS, DIAL_MIN_LABEL_PX, DIAL_REJECT_MS, dialScale, type ConstructionDial } from '../map/constructionDial';

const stock = (o: Partial<Record<'wood' | 'stone' | 'food' | 'iron', number>> = {}) => ({ wood: 0, stone: 0, food: 0, iron: 0, ...o });

function def(level: number, over: Partial<BuildingDefinitionResponse> = {}): BuildingDefinitionResponse {
  return {
    type: 'lumberjack',
    level,
    cost: stock({ wood: 100 }),
    buildSeconds: 60,
    requiredLonghouseLevel: 1,
    slotCost: 1,
    occupiesMostSlots: false,
    prerequisites: [],
    ...over,
  } as BuildingDefinitionResponse;
}

function input(over: Partial<BuildingHudInput> = {}): BuildingHudInput {
  return {
    coord: { q: 1, r: 2 },
    type: 'lumberjack',
    level: 2,
    definitions: [def(1), def(2), def(3)],
    queue: [],
    longhouseLevel: 5,
    builtLevels: { longhouse: 5 },
    available: stock({ wood: 1000, stone: 1000, food: 1000, iron: 1000 }),
    storageCap: stock({ wood: 5000, stone: 5000, food: 5000, iron: 5000 }),
    rates: stock({ wood: 360, stone: 360, food: 360, iron: 360 }),
    construction: { slots: 2, slotsUsed: 0, maxWaitingOrders: 0, waitingOrders: 0 },
    worldSpeedFactor: 1,
    ...over,
  };
}

const order = (over: Partial<BuildOrderResponse> = {}): BuildOrderResponse =>
  ({
    id: 'o1', q: 1, r: 2, building: 'lumberjack', kind: 'build', targetLevel: 3, state: 'building', slotCost: 1,
    completesAtGameTime: null, completesInSeconds: 30, totalSeconds: 120, ...over,
  }) as BuildOrderResponse;

describe('upgrade state', () => {
  it('is ready when affordable and unblocked', () => {
    const vm = buildingHudViewModel(input());
    expect(vm.upgrade).toMatchObject({ state: 'ready', targetLevel: 3 });
    expect(vm.dial).toMatchObject({ kind: 'state', ring: 'ready' });
  });

  it('carries the next level\'s cost and its build time as the settlement runs it', () => {
    expect(buildingHudViewModel(input()).upgrade).toMatchObject({ cost: stock({ wood: 100 }), buildSeconds: 60 });
    // Odin's Wisdom shortens it, the world's speed divides it (scaledBuildSeconds).
    expect(buildingHudViewModel(input({ wisdomFactor: 0.5, worldSpeedFactor: 2 })).upgrade.buildSeconds).toBe(15);
    // No catalogue entry for the next level: the client's estimate prices it, and there is no time.
    const estimated = buildingHudViewModel(input({ definitions: undefined })).upgrade;
    expect(estimated.cost).toBeDefined();
    expect(estimated.buildSeconds).toBeUndefined();
  });

  it('is short with the missing amounts and the time until production covers them', () => {
    const vm = buildingHudViewModel(input({ available: stock({ wood: 40 }), rates: stock({ wood: 120 }) }));
    expect(vm.upgrade.state).toBe('short');
    expect(vm.upgrade.missing).toEqual([{ resource: 'wood', amount: 60 }]);
    expect(vm.upgrade.affordableInSeconds).toBe(1800);
    expect(vm.dial.ring).toBe('blocked');
  });

  it('is longhouse-locked when the settlement Longhouse is too low', () => {
    const vm = buildingHudViewModel(input({ definitions: [def(1), def(2), def(3, { requiredLonghouseLevel: 9 })] }));
    expect(vm.upgrade.state).toBe('longhouse');
    expect(vm.upgrade.requirements).toEqual([{ kind: 'longhouse', level: 9 }]);
    expect(vm.dial.ring).toBe('blocked');
  });

  it('is prereq when a prerequisite building is missing', () => {
    const vm = buildingHudViewModel(input({ definitions: [def(1), def(2), def(3, { prerequisites: [{ type: 'quarry', level: 4 }] })] }));
    expect(vm.upgrade.state).toBe('prereq');
    expect(vm.upgrade.requirements).toEqual([{ kind: 'building', type: 'quarry', level: 4 }]);
  });

  it('is storage when the next level costs more than the stores hold, even if it would otherwise be short', () => {
    const vm = buildingHudViewModel(
      input({ definitions: [def(1), def(2), def(3, { cost: stock({ wood: 900 }) })], storageCap: stock({ wood: 500 }), available: stock({ wood: 100 }) }),
    );
    expect(vm.upgrade.state).toBe('storage');
    expect(vm.dial.ring).toBe('blocked');
  });

  it('is upgrading with progress, time left and target while an order runs', () => {
    const vm = buildingHudViewModel(input({ queue: [order()] }));
    expect(vm.upgrade).toMatchObject({ state: 'upgrading', targetLevel: 3 });
    expect(vm.dial).toMatchObject({ kind: 'upgrading', ring: 'upgrading', secondsLeft: 30, targetLevel: 3, progress: 0.75 });
  });

  it('ignores a running order on another hex and a raze on this one', () => {
    expect(buildingHudViewModel(input({ queue: [order({ q: 9 })] })).upgrade.state).toBe('ready');
    expect(buildingHudViewModel(input({ queue: [order({ kind: 'raze', targetLevel: 1 })] })).upgrade.state).not.toBe('upgrading');
  });

  it('is max at the type ceiling, with a full ring', () => {
    const vm = buildingHudViewModel(input({ type: 'tower', level: 5 }));
    expect(vm.maxLevel).toBe(5);
    expect(vm.upgrade.state).toBe('max');
    expect(vm.dial).toMatchObject({ ring: 'max', progress: 1 });
  });

  it('stays ready when affordable but the hex waits behind another order', () => {
    const vm = buildingHudViewModel(input({ definitions: [def(1), def(2), def(3), def(4)], queue: [order({ state: 'waiting' })] }));
    expect(vm.upgrade.state).toBe('ready');
    expect(vm.dial.ring).toBe('ready');
  });

  it('wears the crown only on a maxed Longhouse', () => {
    expect(buildingHudViewModel(input({ type: 'longhouse', level: 30, definitions: undefined })).upgrade.crown).toBe(true);
    expect(buildingHudViewModel(input({ type: 'longhouse', level: 8, definitions: undefined })).upgrade.crown).toBe(false);
    expect(buildingHudViewModel(input({ type: 'tower', level: 10 })).upgrade.crown).toBe(false);
    expect(buildingHudViewModel(input({ type: 'townsquare', definitions: undefined })).upgrade.crown).toBe(false);
  });

  it('is not max, and wears no crown, while an order only waits for the last level', () => {
    // Longhouse at 29 with a waiting order to 30: it stands at 29, so no gold ring and no crown yet.
    const longhouseDefs = Array.from({ length: 30 }, (_, i) => def(i + 1, { type: 'longhouse' }));
    const waiting = order({ building: 'longhouse', targetLevel: 30, state: 'waiting' });
    const vm = buildingHudViewModel(input({ type: 'longhouse', level: 29, definitions: longhouseDefs, queue: [waiting] }));
    expect(vm.upgrade).toMatchObject({ state: 'queued', targetLevel: 30, crown: false });
    expect(vm.dial.ring).not.toBe('max');
    expect(vm.dial.progress).toBeUndefined();
    // The same with a catalogue that ends at the order's level.
    const short = buildingHudViewModel(input({ level: 2, definitions: [def(1), def(2), def(3)], queue: [order({ state: 'waiting' })] }));
    expect(short.upgrade.state).toBe('queued');
    // Standing at the last level is max and crowned.
    const done = buildingHudViewModel(input({ type: 'longhouse', level: 30, definitions: longhouseDefs }));
    expect(done.upgrade).toMatchObject({ state: 'max', crown: true });
    // A catalogue whose last level is below the type ceiling: standing there is max.
    expect(buildingHudViewModel(input({ level: 3, definitions: [def(1), def(2), def(3)] })).upgrade.state).toBe('max');
  });
});

describe('affordableInSeconds', () => {
  it('takes the slowest missing resource', () => {
    expect(affordableInSeconds([{ resource: 'wood', amount: 100 }, { resource: 'stone', amount: 100 }], stock({ wood: 3600, stone: 360 }))).toBe(1000);
  });
  it('is null when a missing resource has no income', () => {
    expect(affordableInSeconds([{ resource: 'iron', amount: 5 }], stock())).toBeNull();
  });
});

describe('requirement listing', () => {
  const reqs = (n: number) => ({
    definitions: [def(1), def(2), def(3, { prerequisites: Array.from({ length: n }, (_, i) => ({ type: `b${i}`, level: 2 })) })],
  });
  const upgradeRowOf = (rows: HudRow[]) => rows[0] as Extract<HudRow, { kind: 'upgrade' }>;

  it.each([
    [1, 1, 0],
    [2, 2, 0],
    [3, 3, 0],
    [4, 2, 2],
    [5, 2, 3],
  ])('near with %i requirements lists %i and folds %i', (n, shown, more) => {
    const row = upgradeRowOf(rowsFor(buildingHudViewModel(input(reqs(n))), 'near', { premium: false }));
    expect(row.requirements).toHaveLength(shown);
    expect(row.moreCount).toBe(more);
  });

  it.each([
    [1, 1, 0],
    [2, 2, 0],
    [3, 1, 2],
    [4, 1, 3],
    [5, 1, 4],
  ])('mid with %i requirements lists %i and folds %i', (n, shown, more) => {
    const row = upgradeRowOf(rowsFor(buildingHudViewModel(input(reqs(n))), 'mid', { premium: false }));
    expect(row.requirements).toHaveLength(shown);
    expect(row.moreCount).toBe(more);
  });

  it('counts the Longhouse requirement as a line, listed first', () => {
    const vm = buildingHudViewModel(input({ definitions: [def(1), def(2), def(3, { requiredLonghouseLevel: 9, prerequisites: [{ type: 'quarry', level: 4 }] })] }));
    expect(vm.upgrade.state).toBe('longhouse');
    expect(vm.upgrade.requirements?.map((r) => r.kind)).toEqual(['longhouse', 'building']);
  });
});

describe('rowsFor', () => {
  const garrison = [{ unit: 'spearman', count: 4 }, { unit: 'axeman', count: 3 }];

  it('shows nothing on far', () => {
    expect(rowsFor(buildingHudViewModel(input()), 'far', { premium: true })).toEqual([]);
  });

  it('near: upgrade then production', () => {
    const rows = rowsFor(buildingHudViewModel(input()), 'near', { premium: false });
    expect(rows.map((r) => r.kind)).toEqual(['upgrade', 'production']);
    expect(rows[1]).toMatchObject({ production: [{ resource: 'wood' }] });
  });

  it('a storage building shows its capacity', () => {
    const rows = rowsFor(buildingHudViewModel(input({ type: 'storagehouse', definitions: undefined })), 'near', { premium: false });
    expect(rows.map((r) => r.kind)).toEqual(['upgrade', 'storage']);
  });

  it('the Longhouse with a garrison drops production in favour of the garrison', () => {
    const vm = buildingHudViewModel(input({ type: 'longhouse', level: 3, definitions: undefined, garrison }));
    expect(rowsFor(vm, 'near', { premium: false }).map((r) => r.kind)).toEqual(['upgrade', 'garrison']);
    const mid = rowsFor(vm, 'mid', { premium: false })[1] as Extract<HudRow, { kind: 'compact' }>;
    expect(mid.production).toBeUndefined();
    expect(mid.garrisonTotal).toBe(7);
  });

  it('other buildings never show the settlement garrison', () => {
    expect(buildingHudViewModel(input({ garrison })).garrison).toBeUndefined();
  });

  it('mid has two rows at most, the second compact', () => {
    const rows = rowsFor(buildingHudViewModel(input()), 'mid', { premium: false });
    expect(rows.map((r) => r.kind)).toEqual(['upgrade', 'compact']);
  });

  it('a training building shows its queue pips and current order', () => {
    const t = { id: 't', unit: 'spearman', q: 1, r: 2, count: 3, completedCount: 0, completesInSeconds: 50, totalSeconds: 200 } as TrainingOrderResponse;
    const vm = buildingHudViewModel(input({ type: 'barracks', definitions: undefined, trainingQueue: [t, { ...t, id: 'u', q: 7 }] }));
    expect(vm.training).toMatchObject({ slotsUsed: 1, slotsMax: 5, current: { unit: 'spearman', count: 3, secondsLeft: 50, progress: 0.75 } });
    expect(rowsFor(vm, 'near', { premium: false }).map((r) => r.kind)).toContain('training');
  });

  it('a running feast replaces production on the Town Square', () => {
    const vm = buildingHudViewModel(input({ type: 'townsquare', definitions: undefined, feast: { secondsLeft: 100, totalSeconds: 200, renownGain: 6122 } }));
    expect(rowsFor(vm, 'near', { premium: false })[1]).toMatchObject({ kind: 'feast', secondsLeft: 100, renownGain: 6122 });
  });

  describe('quick upgrade line of the hovered marker', () => {
    const upgradeRow = (vm: ReturnType<typeof buildingHudViewModel>, quick?: 'premium' | 'locked', shift = false) =>
      rowsFor(vm, 'near', { premium: quick !== 'locked', quick, shift })[0] as Extract<HudRow, { kind: 'upgrade' }>;

    it('a ready upgrade carries the next level\'s cost and build time', () => {
      expect(upgradeRow(buildingHudViewModel(input()), 'premium', true).quick).toEqual({
        mode: 'premium',
        shift: true,
        cost: stock({ wood: 100 }),
        buildSeconds: 60,
      });
    });
    it('a blocked upgrade adds nothing: its own state shows as before', () => {
      expect(upgradeRow(buildingHudViewModel(input({ available: stock({ wood: 40 }) })), 'premium').quick).toBeUndefined();
      expect(upgradeRow(buildingHudViewModel(input({ type: 'tower', level: 5 })), 'premium').quick).toBeUndefined();
    });
    it('a free account holding Shift gets the locked line, whatever the state', () => {
      expect(upgradeRow(buildingHudViewModel(input()), 'locked').quick).toMatchObject({ mode: 'locked' });
      expect(upgradeRow(buildingHudViewModel(input({ available: stock() })), 'locked').quick).toMatchObject({ mode: 'locked' });
    });
    it('without a quick mode the row is the plain one, and the layout signature tells the two apart', () => {
      const vm = buildingHudViewModel(input());
      const plain = rowsFor(vm, 'near', { premium: true });
      expect((plain[0] as Extract<HudRow, { kind: 'upgrade' }>).quick).toBeUndefined();
      const quick = rowsFor(vm, 'near', { premium: true, quick: 'premium' });
      expect(rowsSignature('near', quick)).not.toBe(rowsSignature('near', plain));
      expect(rowsSignature('near', rowsFor(vm, 'near', { premium: true, quick: 'premium', shift: true }))).not.toBe(rowsSignature('near', quick));
    });
  });

  describe('time until affordable', () => {
    const short = () => buildingHudViewModel(input({ available: stock({ wood: 40 }), rates: stock({ wood: 120 }) }));
    it('premium gets the time and no hint', () => {
      expect(rowsFor(short(), 'near', { premium: true })[0]).toMatchObject({ affordableInSeconds: 1800, premiumHint: false });
    });
    it('free gets the premium hint and no time', () => {
      const row = rowsFor(short(), 'near', { premium: false })[0] as Extract<HudRow, { kind: 'upgrade' }>;
      expect(row.premiumHint).toBe(true);
      expect(row.affordableInSeconds).toBeUndefined();
    });
    it('neither shows it when nothing is short', () => {
      expect(rowsFor(buildingHudViewModel(input()), 'near', { premium: true })[0]).toMatchObject({ premiumHint: false, affordableInSeconds: undefined });
    });
  });
});

describe('tierFor', () => {
  const { labelBelow, boxBelow, nearAt, hysteresis } = HUD_TIER;
  it('goes far exactly where the progress dial hides its label', () => {
    // dialScale(mapScale, 0) shows the label from this size on; below it the marker is the ring only.
    expect(dialScale(labelBelow, 0).showLabel).toBe(true);
    expect(dialScale(labelBelow - 0.01, 0).showLabel).toBe(false);
    expect(tierFor(labelBelow)).toBe('dial');
    expect(tierFor(labelBelow - 0.01)).toBe('far');
  });
  it('shows the box once its text would be at least the minimum label size on screen', () => {
    expect(HUD_BOX_FONT_PX * boxBelow).toBeCloseTo(DIAL_MIN_LABEL_PX);
    expect(tierFor(boxBelow - 0.01)).toBe('dial');
    expect(tierFor(boxBelow)).toBe('mid');
  });
  it('goes near at the one exported threshold', () => {
    expect(tierFor(1)).toBe('mid');
    expect(tierFor(nearAt - 0.01)).toBe('mid');
    expect(tierFor(nearAt)).toBe('near');
  });
  it('keeps the tier until zs is past the threshold by the hysteresis', () => {
    expect(tierFor(nearAt - hysteresis / 2, 'near')).toBe('near');
    expect(tierFor(nearAt - hysteresis - 0.001, 'near')).toBe('mid');
    expect(tierFor(nearAt - hysteresis / 2, 'mid')).toBe('mid');
    expect(tierFor(boxBelow - hysteresis / 2, 'mid')).toBe('mid');
    expect(tierFor(boxBelow - hysteresis / 2, 'dial')).toBe('dial');
    expect(tierFor(labelBelow - hysteresis / 2, 'dial')).toBe('dial');
    expect(tierFor(labelBelow - hysteresis / 2, 'far')).toBe('far');
  });
  it('does not flicker when zs jitters around a threshold', () => {
    let tier = tierFor(nearAt + 0.05, null);
    const seen = new Set<string>();
    for (const z of [nearAt + 0.01, nearAt - 0.01, nearAt + 0.02, nearAt - 0.02, nearAt]) seen.add((tier = tierFor(z, tier)));
    expect(seen).toEqual(new Set(['near']));
  });
  it('has no box rows on far and dial', () => {
    const vm = buildingHudViewModel(input());
    expect(rowsFor(vm, 'far', { premium: false })).toEqual([]);
    expect(rowsFor(vm, 'dial', { premium: false })).toEqual([]);
  });
});

describe('markerScale', () => {
  it('grows at least 1.3x on hover', () => {
    expect(markerScale(1.5, 0)).toBeCloseTo(1.5, 6);
    expect(markerScale(1.5, 1)).toBeCloseTo(1.95, 6);
    expect(markerScale(2, 1)).toBeCloseTo(2.6, 6);
  });

  it('at the smallest zoom lifts to the size where the compact box with text shows', () => {
    expect(tierFor(0.3)).toBe('far');
    expect(tierFor(markerScale(0.3, 1))).toBe('mid');
    expect(tierFor(markerScale(0.05, 1))).toBe('mid');
    // Not hovered it stays the size the map gives it.
    expect(markerScale(0.3, 0)).toBeCloseTo(0.3, 6);
  });

  it('eases in between (half way is half way) and clamps the hover progress', () => {
    expect(markerScale(1.5, 0.5)).toBeCloseTo(1.5 + 0.45 / 2, 6);
    expect(markerScale(1.5, 3)).toBeCloseTo(1.95, 6);
    expect(markerScale(1.5, -1)).toBeCloseTo(1.5, 6);
  });
});

describe('box hit', () => {
  it('puts the box right of the dial centre line, centred on it vertically, scaled by zs', () => {
    expect(markerBoxRect(100, 200, { w: 80, h: 40 }, 1.5)).toEqual({ x: 100, y: 170, w: 120, h: 60 });
  });

  it('hits inside the rect and on its edges, not outside', () => {
    const rect = { x: 100, y: 170, w: 120, h: 60 };
    expect(pointInRect({ x: 150, y: 200 }, rect)).toBe(true);
    expect(pointInRect({ x: 220, y: 230 }, rect)).toBe(true);
    expect(pointInRect({ x: 99, y: 200 }, rect)).toBe(false);
    expect(pointInRect({ x: 150, y: 231 }, rect)).toBe(false);
  });
});

describe('stackOrder', () => {
  it('puts the right-most marker on top', () => {
    expect(stackOrder([{ x: 30, id: 'c' }, { x: 10, id: 'a' }, { x: 20, id: 'b' }]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('puts the hovered marker last, whatever its x', () => {
    expect(stackOrder([{ x: 10, id: 'a', hovered: true }, { x: 30, id: 'c' }, { x: 20, id: 'b' }]).map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
  it('leaves the input alone', () => {
    const markers = [{ x: 2 }, { x: 1 }];
    stackOrder(markers);
    expect(markers[0].x).toBe(2);
  });
});

describe('hudMarkerKeys', () => {
  const built = (q: number, level: number, type = 'barracks') => ({ q, r: 0, type, level });

  it('lists the hexes of standing buildings, bridges included', () => {
    expect([...hudMarkerKeys([built(1, 2), built(2, 1, 'bridge')])]).toEqual(['1,0', '2,0']);
  });

  it('leaves out new builds (level 0 site) and walls, which get no marker', () => {
    expect(hudMarkerKeys([built(1, 0), built(2, 1, 'palisade'), built(3, 1, 'palisadegate')]).size).toBe(0);
  });
});

describe('order dial of a standing building', () => {
  const NOW = 1_000_000;
  const orderDial = (over: Partial<ConstructionDial> = {}): ConstructionDial => ({
    coord: { q: 1, r: 2 },
    startMs: null,
    endMs: null,
    state: 'queued',
    queuePosition: 2,
    ...over,
  });
  const vmWith = (dial: ConstructionDial | null, over: Partial<BuildingHudInput> = {}) =>
    buildingHudViewModel(input({ orderDial: dial, nowMs: NOW, ...over }));

  it('stays the plain state dial without an order', () => {
    expect(vmWith(null).dial.kind).toBe('state');
  });

  it('is queued with its place for a waiting order', () => {
    const vm = vmWith(orderDial(), { queue: [order({ state: 'waiting', completesInSeconds: null, totalSeconds: 0 })] });
    expect(vm.dial).toMatchObject({ kind: 'queued', ring: 'upgrading', queuePosition: 2 });
  });

  it('is pending for an order the server has not answered yet', () => {
    expect(vmWith(orderDial({ state: 'pending', queuePosition: null })).dial).toMatchObject({ kind: 'pending', ring: 'upgrading' });
  });

  it('keeps a running upgrade as the upgrading dial and hands it the order for its finish', () => {
    const running = orderDial({ state: 'building', queuePosition: null, startMs: NOW - 90_000, endMs: NOW + 30_000 });
    const vm = vmWith(running, { queue: [order()] });
    expect(vm.dial).toMatchObject({ kind: 'upgrading', secondsLeft: 30, order: running });
  });

  it('shows a running raze with its progress arc and time', () => {
    const razing = orderDial({ state: 'building', queuePosition: null, startMs: NOW - 30_000, endMs: NOW + 90_000 });
    const vm = vmWith(razing, { queue: [order({ kind: 'raze', targetLevel: 1, completesInSeconds: 90, totalSeconds: 120 })] });
    expect(vm.dial).toMatchObject({ kind: 'razing', ring: 'upgrading', progress: 0.25, secondsLeft: 90 });
    expect(vm.upgrade.state).not.toBe('upgrading');
  });

  it('is rejected while the refusal plays and the state dial again once it is over', () => {
    const rejected = orderDial({ state: 'pending', queuePosition: null, rejectedAtMs: NOW - 200 });
    expect(vmWith(rejected).dial).toMatchObject({ kind: 'rejected', order: rejected });
    expect(vmWith(rejected, { nowMs: NOW + DIAL_REJECT_MS }).dial.kind).toBe('state');
  });

  it('is finishing from the order end on, even while the order is still in the queue, and the state dial after the animation', () => {
    const ending = orderDial({ state: 'building', queuePosition: null, startMs: NOW - 120_000, endMs: NOW - 100 });
    const vm = vmWith(ending, { queue: [order({ completesInSeconds: 0 })] });
    expect(vm.dial).toMatchObject({ kind: 'finishing', order: ending });
    expect(vmWith(ending, { nowMs: NOW + DIAL_FINISH_MS }).dial.kind).toBe('state');
  });

  it('settles (no colour, no number) once the order has finished and the queue still holds it until the next poll', () => {
    const ending = orderDial({ state: 'building', queuePosition: null, startMs: NOW - 120_000, endMs: NOW - 100 });
    const stale = [order({ completesInSeconds: 0, totalSeconds: 120 })];
    // The finish animation is over, the renderer has pruned the dial, the queue is as fetched.
    for (const dial of [null, ending]) {
      const vm = vmWith(dial, { queue: stale, nowMs: NOW + DIAL_FINISH_MS });
      expect(vm.dial).toMatchObject({ kind: 'settling', ring: 'none', secondsLeft: 0 });
      expect(vm.dial.progress).toBeUndefined();
      // The box keeps what it said.
      expect(vm.upgrade.state).toBe('upgrading');
    }
    // The new level arrives with the next poll: the normal state ring again.
    expect(vmWith(null, { queue: [], level: 3, nowMs: NOW + DIAL_FINISH_MS }).dial).toMatchObject({ kind: 'state' });
  });

  it('settles a raze whose time is up the same way', () => {
    const razing = orderDial({ state: 'building', queuePosition: null, startMs: NOW - 120_000, endMs: NOW + 100 });
    const vm = vmWith(razing, { queue: [order({ kind: 'raze', targetLevel: 1, completesInSeconds: 0, totalSeconds: 120 })] });
    expect(vm.dial).toMatchObject({ kind: 'settling', ring: 'none' });
  });

  it('keeps the upgrade rows of the building underneath', () => {
    const vm = vmWith(orderDial({ state: 'pending', queuePosition: null }));
    expect(vm.upgrade.state).toBe('ready');
  });
});

describe('rowsSignature', () => {
  const upgrade = (over: Partial<Extract<HudRow, { kind: 'upgrade' }>> = {}): HudRow => ({
    kind: 'upgrade',
    state: 'ready',
    crown: false,
    requirements: [],
    moreCount: 0,
    premiumHint: false,
    ...over,
  });
  const training = (over: Partial<Extract<HudRow, { kind: 'training' }>> = {}): HudRow => ({ kind: 'training', slotsUsed: 1, slotsMax: 5, ...over });

  it('does not change when only a countdown or an amount ticks', () => {
    const current = (secondsLeft: number, progress: number) => ({ unit: 'spearman', count: 5, secondsLeft, progress, totalSeconds: 100 });
    const a = [upgrade(), training({ current: current(60, 0.1) })];
    const b = [upgrade(), training({ current: current(59, 0.12), slotsUsed: 2 })];
    expect(rowsSignature('near', a)).toBe(rowsSignature('near', b));
    const feast = (secondsLeft: number): HudRow => ({ kind: 'feast', secondsLeft, total: 100, renownGain: 5 });
    expect(rowsSignature('near', [feast(10)])).toBe(rowsSignature('near', [feast(9)]));
  });

  it('changes when the layout does: a training order starts, the upgrade state flips, the tier differs', () => {
    const idle = [upgrade(), training()];
    const busy = [upgrade(), training({ current: { unit: 'spearman', count: 5, secondsLeft: 60, progress: 0, totalSeconds: 100 } })];
    expect(rowsSignature('near', idle)).not.toBe(rowsSignature('near', busy));
    expect(rowsSignature('near', [upgrade()])).not.toBe(rowsSignature('near', [upgrade({ state: 'upgrading', targetLevel: 3 })]));
    expect(rowsSignature('near', idle)).not.toBe(rowsSignature('mid', idle));
  });

  it('is empty after the bar for a tier without a box', () => {
    expect(rowsSignature('far', [])).toBe('far|');
  });
});

describe('ageViewModel', () => {
  const none = { queue: 0, training: 0, feast: 0 };

  it('returns the same object when nothing on the marker ticks', () => {
    const vm = buildingHudViewModel(input());
    expect(ageViewModel(vm, { queue: 30, training: 30, feast: 30 })).toBe(vm);
  });

  it('moves a running upgrade along: the time left falls and the arc grows, never below zero', () => {
    const vm = buildingHudViewModel(input({ queue: [order({ completesInSeconds: 30, totalSeconds: 120 })] }));
    expect(vm.dial).toMatchObject({ secondsLeft: 30, progress: 0.75 });
    expect(ageViewModel(vm, { ...none, queue: 15 }).dial).toMatchObject({ secondsLeft: 15, progress: 0.875 });
    // Past the end the dial shows nothing (`settling`) until the next poll.
    expect(ageViewModel(vm, { ...none, queue: 99 }).dial).toMatchObject({ kind: 'settling', ring: 'none', secondsLeft: 0 });
    // The view model it was made from is not touched.
    expect(vm.dial.secondsLeft).toBe(30);
  });

  it('ages the training order in progress and a feast on their own clocks', () => {
    const vm = buildingHudViewModel(
      input({
        type: 'townsquare',
        definitions: undefined,
        feast: { secondsLeft: 100, totalSeconds: 200, renownGain: 5 },
      }),
    );
    expect(ageViewModel(vm, { queue: 50, training: 50, feast: 40 }).feast?.secondsLeft).toBe(60);
    const training = buildingHudViewModel(
      input({
        type: 'barracks',
        definitions: undefined,
        trainingQueue: [{ id: 't', q: 1, r: 2, unit: 'spearman', count: 5, startsInSeconds: 0, completesInSeconds: 60, totalSeconds: 120 } as TrainingOrderResponse],
      }),
    );
    expect(ageViewModel(training, { queue: 0, training: 30, feast: 0 }).training?.current).toMatchObject({ secondsLeft: 30, progress: 0.75 });
  });
});
