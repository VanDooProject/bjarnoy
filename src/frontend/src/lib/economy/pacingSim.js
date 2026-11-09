import { FEAST_HOURS, RENOWN_BASE_THRESHOLD, feastCost, feastRenown } from './feasts';
import { additionalStorageHouseRequirement } from '../map/buildingEconomy';
import { SETTLERS_PER_FOUNDING } from '../founding';
export const RESOURCES = ['wood', 'stone', 'food', 'iron'];
/** BuildingCatalogue.BaseStorageCapacity (ResourceAmounts.Uniform(500)). */
export const BASE_STORAGE_CAPACITY = 500;
/** BuildingCatalogue.FoundingStock: what a new settlement starts with. */
export const FOUNDING_STOCK = { wood: 700, stone: 700, food: 700, iron: 0 };
/** Fallback for 5 x Settler.trainingCost when the unit catalogue has no settler row. */
export const FALLBACK_SETTLER_COST = { wood: 600, stone: 450, food: 300, iron: 300 };
export const DEFAULT_PRODUCER_COUNTS = { lumberjack: 3, quarry: 3, reindeerherder: 3 };
const check = (start) => ({ start, minutes: 10 });
/** Daily schedules (design §9). `always24` is a reference line, not a realistic player. */
export const PROFILE_PRESETS = {
    active: [{ start: '07:00', minutes: 960 }],
    checkins4: [check('08:00'), check('12:00'), check('17:00'), check('21:00')],
    checkins2: [check('08:00'), check('20:00')],
    always24: [{ start: '00:00', minutes: 1440 }],
};
export const DEFAULT_JOIN_TIME = '09:00';
export const DEFAULT_PRODUCERS_AHEAD = 3;
export const DEFAULT_RENOWN_THRESHOLD = RENOWN_BASE_THRESHOLD;
export const DEFAULT_RENOWN_PER_LEVEL_HOUR = 1.0;
export { FEAST_HOURS, feastCost, feastRenown };
/** Growth counts as flat when a day adds less than this share of the previous day's production. */
export const GROWTH_FLAT_FRACTION = 0.05;
const LONGHOUSE = 'longhouse';
const TOWN_SQUARE = 'townsquare';
const TOWN_SQUARE_MAX_LEVEL = 10;
const STORAGE = 'storagehouse';
const STORAGE_FULL_FRACTION = 0.85;
/** Construction slots — mirrors Settlement.ConstructionSlotsFor in the backend: 2 + max(0, (lh - 5) / 5). */
export function constructionSlotsFor(longhouseLevel) {
    return 2 + Math.max(0, Math.floor((longhouseLevel - 5) / 5));
}
/** 'HH:MM' -> minutes since midnight. Unparseable input gives 0. */
export function parseClock(text) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    if (!m)
        return 0;
    return (Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]))) % 1440;
}
/** For each minute of the day, whether any session covers it (sessions may wrap past midnight). */
export function onlineMask(sessions) {
    const mask = new Uint8Array(1440);
    for (const s of sessions) {
        const start = parseClock(s.start);
        const len = Math.min(1440, Math.max(0, Math.floor(s.minutes)));
        for (let i = 0; i < len; i++)
            mask[(start + i) % 1440] = 1;
    }
    return mask;
}
/** Is the player online at this minute of the day? */
export function isOnline(sessions, minuteOfDay) {
    return onlineMask(sessions)[((Math.floor(minuteOfDay) % 1440) + 1440) % 1440] === 1;
}
/** Total production per hour (wood + stone + food) in the series on the given day (0-based, from joining). */
export function productionOnDay(result, day) {
    const i = day * 24;
    if (i >= result.series.minute.length)
        return null;
    return result.series.rate.wood[i] + result.series.rate.stone[i] + result.series.rate.food[i];
}
/** Default settler cost: 5 x the Settler training cost, or the fallback when unavailable. */
export function settlerCostFrom(trainingCost) {
    if (!trainingCost)
        return { ...FALLBACK_SETTLER_COST };
    return {
        wood: trainingCost.wood * SETTLERS_PER_FOUNDING,
        stone: trainingCost.stone * SETTLERS_PER_FOUNDING,
        food: trainingCost.food * SETTLERS_PER_FOUNDING,
        iron: trainingCost.iron * SETTLERS_PER_FOUNDING,
    };
}
function line(l) {
    return Float64Array.of(l.wood, l.stone, l.food, l.iron);
}
function compile(defs) {
    if (!defs)
        return [];
    const out = [];
    for (const d of [...defs].sort((a, b) => a.level - b.level)) {
        const cost = line(d.cost);
        const prod = line(d.productionPerHour);
        out[d.level - 1] = {
            cost,
            total: cost[0] + cost[1] + cost[2] + cost[3],
            prod,
            prodTotal: prod[0] + prod[1] + prod[2] + prod[3],
            storage: line(d.storageCapacity),
            buildMinutes: d.buildSeconds / 60,
            reqLh: d.requiredLonghouseLevel,
            prereqs: d.prerequisites,
            slotCost: d.slotCost,
            occupiesAll: d.occupiesAllSlots,
        };
    }
    return out;
}
export function simulatePacing(byType, params) {
    const compiled = new Map();
    const defsOf = (type) => {
        let c = compiled.get(type);
        if (!c)
            compiled.set(type, (c = compile(byType[type])));
        return c;
    };
    const lhDefs = defsOf(LONGHOUSE);
    const storageDefs = defsOf(STORAGE);
    const lhMax = lhDefs.length;
    const storageMax = storageDefs.length;
    // Owned producers, flat. Only types present in the catalogue with a positive count.
    const pType = [];
    const pDefs = [];
    const pLevel = [];
    const pBusy = [];
    const pResource = [];
    for (const type of Object.keys(params.producerCounts)) {
        const defs = defsOf(type);
        if (defs.length === 0 || type === LONGHOUSE || type === STORAGE)
            continue;
        const primary = primaryResource(defs[0].prod);
        for (let i = 0; i < Math.floor(params.producerCounts[type]); i++) {
            pType.push(type);
            pDefs.push(defs);
            pLevel.push(defs[0].reqLh > 1 ? 0 : 1);
            pBusy.push(false);
            pResource.push(primary);
        }
    }
    const standingBest = new Map();
    const mask = onlineMask(params.sessions);
    const joinMinute = parseClock(params.joinTime ?? DEFAULT_JOIN_TIME);
    const ahead = params.producersAhead ?? DEFAULT_PRODUCERS_AHEAD;
    const renownThreshold = params.renownThreshold ?? DEFAULT_RENOWN_THRESHOLD;
    const renownPerLevelHour = params.renownPerLevelHour ?? DEFAULT_RENOWN_PER_LEVEL_HOUR;
    // Feasts need a Town Square; the sim never builds one but assumes it stands, at
    // level min(10, lh - unlock + 1), from the Longhouse level its level 1 unlocks at.
    const tsUnlock = defsOf(TOWN_SQUARE)[0]?.reqLh;
    const feastsOn = !!params.feasts && tsUnlock !== undefined;
    let renown = 0;
    let sumLevels = 0;
    let feastEndsAt = -1;
    let feastGrant = 0;
    let feastsHeld = 0;
    let renownReachedAt = null;
    const feastGain = params.feastGain ?? feastRenown;
    let lh = lhMax > 0 ? 1 : 0;
    // One entry per owned storage house; 0 = not built yet.
    const storageLevels = [];
    for (let i = 0; i < Math.max(1, Math.floor(params.storageCount ?? 1)); i++) {
        storageLevels.push(i === 0 && storageMax > 0 ? 1 : 0);
    }
    let storageBusy = false;
    let lhBusy = false;
    const stock = Float64Array.of(params.startStock.wood, params.startStock.stone, params.startStock.food, params.startStock.iron);
    const rate = new Float64Array(4);
    const capacity = new Float64Array(4);
    const jobs = [];
    let usedSlots = 0;
    function refresh() {
        rate.fill(0);
        capacity.fill(BASE_STORAGE_CAPACITY);
        if (lh > 0)
            addDef(lhDefs[lh - 1]);
        let storageBest = 0;
        for (const level of storageLevels) {
            if (level > 0)
                addDef(storageDefs[level - 1]);
            storageBest = Math.max(storageBest, level);
        }
        standingBest.clear();
        sumLevels = lh;
        for (const level of storageLevels)
            sumLevels += level;
        for (let i = 0; i < pLevel.length; i++) {
            if (pLevel[i] === 0)
                continue; // not built yet
            addDef(pDefs[i][pLevel[i] - 1]);
            sumLevels += pLevel[i];
            if ((standingBest.get(pType[i]) ?? 0) < pLevel[i])
                standingBest.set(pType[i], pLevel[i]);
        }
        if (lh > 0)
            standingBest.set(LONGHOUSE, lh);
        if (storageBest > 0)
            standingBest.set(STORAGE, storageBest);
    }
    function addDef(d) {
        for (let r = 0; r < 4; r++) {
            rate[r] += d.prod[r];
            capacity[r] += d.storage[r];
        }
    }
    refresh();
    /** `strict`: a prerequisite on a type the sim never builds counts as unmet. Lenient: it is assumed built on demand. */
    function placeable(d, strict) {
        if (!d || d.reqLh > lh)
            return false;
        for (const p of d.prereqs) {
            const have = standingBest.get(p.type);
            if (have === undefined) {
                if (strict)
                    return false;
                continue;
            }
            if (have < p.level)
                return false;
        }
        return true;
    }
    function affordable(d) {
        return stock[0] >= d.cost[0] && stock[1] >= d.cost[1] && stock[2] >= d.cost[2] && stock[3] >= d.cost[3];
    }
    function spend(d) {
        for (let r = 0; r < 4; r++)
            stock[r] -= d.cost[r];
    }
    const settleDef = defsOf(params.settleType)[0];
    const sc = line(params.settlerCost);
    const horizon = Math.max(0, Math.floor(params.horizonDays * 1440));
    const lhReachedAt = {};
    if (lh > 0)
        lhReachedAt[lh] = 0;
    let secondSettlementAt = null;
    const series = {
        minute: [],
        lh: [],
        rate: { wood: [], stone: [], food: [], iron: [] },
        stock: { wood: [], stone: [], food: [], iron: [] },
    };
    for (let minute = 0; minute <= horizon; minute++) {
        // 1. complete finished jobs and feasts
        if (feastEndsAt >= 0 && feastEndsAt <= minute) {
            renown += feastGrant;
            feastEndsAt = -1;
        }
        let changed = false;
        for (let j = jobs.length - 1; j >= 0; j--) {
            const job = jobs[j];
            if (job.finishMinute > minute)
                continue;
            if (job.kind === 'lh') {
                lh++;
                lhBusy = false;
                lhReachedAt[lh] = minute;
            }
            else if (job.kind === 'storage') {
                storageLevels[job.index]++;
                storageBusy = false;
            }
            else {
                pLevel[job.index]++;
                pBusy[job.index] = false;
            }
            usedSlots -= job.slotCost;
            jobs.splice(j, 1);
            changed = true;
        }
        if (changed)
            refresh();
        // 2. the player acts: at most one start per minute
        const slots = constructionSlotsFor(lh);
        const online = mask[(joinMinute + minute) % 1440] === 1;
        if (online) {
            if (!lhBusy && usedSlots < slots)
                startOne(minute, slots);
            if (feastsOn && feastEndsAt < 0 && lh >= tsUnlock)
                startFeast(minute);
        }
        // 3. second settlement: Cart Workshop placeable, renown reached, settlers affordable
        if (secondSettlementAt === null && renown >= renownThreshold && settleDef && placeable(settleDef, false)) {
            if (stock[0] >= sc[0] && stock[1] >= sc[1] && stock[2] >= sc[2] && stock[3] >= sc[3])
                secondSettlementAt = minute;
        }
        // 4. sample, then accrue one minute of production
        if (minute % 60 === 0) {
            series.minute.push(minute);
            series.lh.push(lh);
            series.rate.wood.push(rate[0]);
            series.rate.stone.push(rate[1]);
            series.rate.food.push(rate[2]);
            series.rate.iron.push(rate[3]);
            series.stock.wood.push(stock[0]);
            series.stock.stone.push(stock[1]);
            series.stock.food.push(stock[2]);
            series.stock.iron.push(stock[3]);
        }
        for (let r = 0; r < 4; r++)
            stock[r] = Math.min(capacity[r], stock[r] + rate[r] / 60);
        renown += (sumLevels * renownPerLevelHour) / 60;
        if (renownReachedAt === null && renown >= renownThreshold)
            renownReachedAt = minute;
    }
    function startFeast(minute) {
        const ts = Math.max(1, Math.min(TOWN_SQUARE_MAX_LEVEL, lh - tsUnlock + 1));
        const cost = feastCost(ts);
        if (stock[0] < cost || stock[1] < cost || stock[2] < cost)
            return;
        stock[0] -= cost;
        stock[1] -= cost;
        stock[2] -= cost;
        feastEndsAt = minute + FEAST_HOURS * 60;
        feastGrant = feastGain(ts);
        feastsHeld++;
    }
    function startOne(minute, slots) {
        // (a) Longhouse: wanted once every producer has caught up with it. It
        // can only start with nothing building, but while it is wanted the
        // player saves for it — producer upgrades (c) are skipped — otherwise a
        // player who is online every minute keeps spending the stock the
        // Longhouse needs and levels it *later* than one who checks in rarely.
        let lhWanted = false;
        if (lh > 0 && lh < lhMax) {
            const next = lhDefs[lh];
            lhWanted = placeable(next, true);
            for (let i = 0; lhWanted && i < pLevel.length; i++) {
                if (pLevel[i] >= Math.min(lh + ahead, pDefs[i].length))
                    continue;
                // A producer that cannot move (next level unplaceable or too big to store) is not waited for.
                const up = pDefs[i][pLevel[i]];
                let blocked = !placeable(up, true);
                for (let r = 0; !blocked && r < 4; r++)
                    if (up.cost[r] > capacity[r])
                        blocked = true;
                if (!blocked)
                    lhWanted = false;
            }
            if (lhWanted && jobs.length === 0 && affordable(next)) {
                spend(next);
                jobs.push({ kind: 'lh', index: 0, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: slots });
                usedSlots += slots;
                lhBusy = true;
                return;
            }
        }
        // (b) storage: when a resource is nearly full, or the next Longhouse
        // level costs more than can be stored, raise the lowest storage house —
        // placing a new one (level 0 -> 1) before upgrading one already standing.
        // An additional house (level 0) may only be started once another stands
        // at the level BuildingCatalogue.AdditionalStorageHouseRequirement asks for.
        const heldHouses = storageLevels.filter((l) => l > 0).length;
        const need = additionalStorageHouseRequirement(heldHouses);
        const additionalAllowed = heldHouses < 1 || storageLevels.filter((l) => l >= need.level).length >= need.count;
        let target = -1;
        for (let i = 0; i < storageLevels.length; i++) {
            if (storageLevels[i] >= storageMax)
                continue;
            if (storageLevels[i] === 0 && !additionalAllowed)
                continue;
            if (target < 0 || storageLevels[i] < storageLevels[target])
                target = i;
        }
        if (!storageBusy && target >= 0) {
            let full = false;
            for (let r = 0; r < 4; r++)
                if (stock[r] > STORAGE_FULL_FRACTION * capacity[r])
                    full = true;
            if (!full && lh > 0 && lh < lhMax) {
                const nextLh = lhDefs[lh];
                for (let r = 0; r < 4; r++)
                    if (nextLh.cost[r] > capacity[r])
                        full = true;
            }
            const next = storageDefs[storageLevels[target]];
            if (full && placeable(next, true) && affordable(next) && usedSlots + next.slotCost <= slots) {
                spend(next);
                jobs.push({ kind: 'storage', index: target, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: next.slotCost });
                usedSlots += next.slotCost;
                storageBusy = true;
                return;
            }
        }
        // (c) best producer upgrade: lowest scarcity-weighted payback
        if (lhWanted)
            return;
        let best = -1;
        let bestScore = Infinity;
        for (let i = 0; i < pLevel.length; i++) {
            if (pBusy[i])
                continue;
            const defs = pDefs[i];
            const level = pLevel[i];
            if (level >= defs.length || level >= lh + ahead)
                continue;
            const next = defs[level];
            const gain = next.prodTotal - (level > 0 ? defs[level - 1].prodTotal : 0);
            if (gain <= 0 || !placeable(next, true) || !affordable(next) || usedSlots + next.slotCost > slots)
                continue;
            const weight = 1 + 1 / (1 + rate[pResource[i]] / 50);
            const score = next.total / gain / weight;
            if (score < bestScore) {
                bestScore = score;
                best = i;
            }
        }
        if (best >= 0) {
            const next = pDefs[best][pLevel[best]];
            spend(next);
            jobs.push({ kind: 'producer', index: best, finishMinute: minute + Math.ceil(next.buildMinutes), slotCost: next.slotCost });
            usedSlots += next.slotCost;
            pBusy[best] = true;
        }
    }
    let growthFlattensAt = null;
    const total = (h) => series.rate.wood[h] + series.rate.stone[h] + series.rate.food[h];
    for (let day = 3; day * 24 < series.minute.length; day++) {
        const before = total((day - 1) * 24);
        if (total(day * 24) < before * (1 + GROWTH_FLAT_FRACTION)) {
            growthFlattensAt = day;
            break;
        }
    }
    return { lhReachedAt, secondSettlementAt, growthFlattensAt, renownReachedAt, renown, feastsHeld, series };
}
function primaryResource(prod) {
    let best = 0;
    for (let r = 1; r < 4; r++)
        if (prod[r] > prod[best])
            best = r;
    return best;
}
