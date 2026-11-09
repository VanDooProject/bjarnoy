import { describe, expect, it } from 'vitest';
import { anySendSourceCanGo, evaluateSendSources } from './sendSources';
function unit(overrides) {
    return {
        class: 'infantry',
        attack: 0,
        defense: 0,
        speed: 2,
        carryCapacity: 0,
        foodCarryCapacity: 10,
        cargoSlots: 0,
        shipSlots: 0,
        upkeepPerHour: 1,
        trainingCost: { wood: 0, stone: 0, food: 0, iron: 0 },
        trainingSeconds: 0,
        requiredLonghouseLevel: 1,
        requiredUnitType: null,
        requiredBuildingType: 'longhouse',
        siegeTargets: [],
        ...overrides,
    };
}
const byType = {
    spearman: unit({ type: 'spearman' }),
    longship: unit({ type: 'longship', class: 'ship', speed: 4 }),
};
const NOW = Date.parse('2026-11-09T12:00:00Z');
const env = {
    byType,
    worldSpeedFactor: 1,
    now: NOW,
    route: (from, to) => ({ path: [from, to], cost: Math.abs(to.q - from.q) + Math.abs(to.r - from.r) }),
};
function army(overrides) {
    return {
        settlementId: 's1',
        mission: 'move',
        targetSettlementId: null,
        atHome: false,
        supporting: false,
        position: { q: 10, r: 0 },
        provisions: 200,
        totalSpeed: 2,
        totalUpkeepPerHour: 10,
        stacks: [{ unit: 'spearman', count: 10 }],
        movement: {
            departedAt: '2026-11-09T08:00:00Z',
            path: [
                { q: 0, r: 0 },
                { q: 10, r: 0 },
            ],
            cumulativeHours: [0, 5],
            edgeHours: [0, 2.5],
            arrivesAt: '2026-11-09T10:00:00Z', // arrived: standing
            returnPath: [],
            returnCumulativeHours: [],
            returnEdgeHours: [],
            turnAroundAt: '2026-11-10T00:00:00Z',
            returnArrivesAt: '2026-11-10T05:00:00Z',
            isReturning: false,
        },
        ...overrides,
    };
}
const target = { mission: 'move', coord: { q: 4, r: 0 }, campAtSea: false };
const homeGarrison = [{ unit: 'spearman', count: 8 }];
function run(armies, opts = {}) {
    return evaluateSendSources({
        target: opts.target ?? target,
        garrison: opts.garrison ?? homeGarrison,
        armies,
        isPremium: opts.isPremium ?? false,
        byType,
        env,
    });
}
describe('evaluateSendSources', () => {
    it('lists home first, then the armies that can go quickest first, then the ones that cannot', () => {
        const near = army({ id: 'near', position: { q: 6, r: 0 } });
        const returning = army({ id: 'ret', movement: { ...army({ id: 'x' }).movement, isReturning: true } });
        const far = army({ id: 'far' });
        far.movement.path = [
            { q: 0, r: 0 },
            { q: 30, r: 0 },
        ];
        const rows = run([returning, far, near]);
        expect(rows.map((r) => r.id)).toEqual(['home', 'near', 'far', 'ret']);
        expect(rows[1].travelMinutes).toBeLessThan(rows[2].travelMinutes);
    });
    it('home can go when the garrison holds units', () => {
        expect(run([])[0]).toMatchObject({ id: 'home', ok: true });
        expect(run([], { garrison: [] })[0]).toMatchObject({ id: 'home', ok: false, block: 'noUnits' });
        expect(run([], { garrison: [{ unit: 'spearman', count: 0 }] })[0]?.ok).toBe(false);
    });
    it('a supporting army must be recalled first', () => {
        const rows = run([army({ id: 'a', supporting: true, movement: null, targetSettlementId: 'host' })], { garrison: [] });
        expect(rows[1]).toMatchObject({ ok: false, block: 'supporting', locked: false });
    });
    it('a returning army cannot take an order', () => {
        const returning = army({ id: 'a' });
        returning.movement.isReturning = true;
        expect(run([returning])[1]).toMatchObject({ ok: false, block: 'returning' });
    });
    it('only move and found missions are orderable', () => {
        expect(run([army({ id: 'a', mission: 'attack' })])[1]).toMatchObject({ ok: false, block: 'notOrderable' });
        expect(run([army({ id: 'b', mission: 'found' })])[1]?.ok).toBe(true);
    });
    it('a marching army is locked behind premium, with the travel time still known', () => {
        const marching = army({ id: 'a' });
        marching.movement.arrivesAt = '2026-11-09T15:00:00Z';
        const free = run([marching])[1];
        const premium = run([marching], { isPremium: true })[1];
        expect(free).toMatchObject({ ok: false, block: 'premium', locked: true, standing: false });
        expect(free.travelMinutes).not.toBeNull();
        expect(premium).toMatchObject({ ok: true, locked: false, standing: false });
    });
    it('a standing army is free', () => {
        expect(run([army({ id: 'a' })])[1]).toMatchObject({ ok: true, standing: true });
    });
    it('a hunt on land needs land units, a hunt at sea ships', () => {
        const ships = army({ id: 'ships', stacks: [{ unit: 'longship', count: 2 }] });
        const landers = army({ id: 'land' });
        const landHunt = { mission: 'hunt', coord: { q: 4, r: 0 }, campAtSea: false };
        const seaHunt = { mission: 'hunt', coord: { q: 4, r: 0 }, campAtSea: true };
        const onLand = run([ships, landers], { target: landHunt });
        const atSea = run([ships, landers], { target: seaHunt });
        expect(onLand.find((r) => r.id === 'ships')).toMatchObject({ ok: false, block: 'wrongClass' });
        expect(onLand.find((r) => r.id === 'land')?.ok).toBe(true);
        expect(atSea.find((r) => r.id === 'land')).toMatchObject({ ok: false, block: 'wrongClass' });
        expect(atSea.find((r) => r.id === 'ships')?.ok).toBe(true);
        // The garrison holds land units only: it cannot hunt at sea.
        expect(atSea[0]).toMatchObject({ id: 'home', ok: false, block: 'wrongClass' });
    });
    it('an army that cannot reach the target, or cannot afford the way home, is listed but cannot go', () => {
        const noRoute = { ...env, route: (from, to) => (to.q === 4 ? null : { path: [from, to], cost: 1 }) };
        const hungry = army({ id: 'hungry', provisions: 5 });
        const unreachable = evaluateSendSources({ target, garrison: [], armies: [army({ id: 'a' })], isPremium: false, byType, env: noRoute });
        const noFood = run([hungry], { garrison: [] });
        expect(unreachable[1]).toMatchObject({ ok: false, block: 'unreachable' });
        expect(noFood[1]).toMatchObject({ ok: false, block: 'noFood' });
    });
    it('an army at home (folded back) is not a field source', () => {
        expect(run([army({ id: 'a', atHome: true, movement: null })]).map((r) => r.id)).toEqual(['home']);
    });
});
describe('anySendSourceCanGo', () => {
    it('is true when only a field army can go', () => {
        expect(anySendSourceCanGo(run([army({ id: 'a' })], { garrison: [] }))).toBe(true);
    });
    it('is true when only home can go', () => {
        expect(anySendSourceCanGo(run([]))).toBe(true);
    });
    it('is false when nothing can go: empty garrison, supporting and returning armies', () => {
        const returning = army({ id: 'r' });
        returning.movement.isReturning = true;
        const rows = run([returning, army({ id: 's', supporting: true, movement: null })], { garrison: [] });
        expect(anySendSourceCanGo(rows)).toBe(false);
    });
});
