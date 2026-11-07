/** Resource producers for the "n producers built" quests (wire names). */
export const PRODUCER_TYPES = new Set([
    'lumberjack',
    'quarry',
    'claybrickworks',
    'reindeerherder',
    'bogoreworks',
    'farm',
    'pumpkinfarm',
    'fishinghut',
]);
function producers(state) {
    let n = 0;
    for (const [type, count] of Object.entries(state.counts)) {
        if (PRODUCER_TYPES.has(type))
            n += count;
    }
    return n;
}
/** The quests in presentation order; a quest's index is its bit in the claimed mask. */
export const QUESTS = [
    { id: 'producers3', reward: { wood: 150, stone: 120, food: 80, iron: 0 }, done: (s) => producers(s) >= 3 },
    { id: 'longhouse2', reward: { wood: 250, stone: 200, food: 150, iron: 0 }, done: (s) => s.level >= 2 },
    { id: 'storagehouse1', reward: { wood: 200, stone: 200, food: 200, iron: 0 }, done: (s) => (s.counts.storagehouse ?? 0) >= 1 },
    { id: 'producers6', reward: { wood: 200, stone: 150, food: 100, iron: 0 }, done: (s) => producers(s) >= 6 },
    { id: 'longhouse3', reward: { wood: 400, stone: 300, food: 200, iron: 0 }, done: (s) => s.level >= 3 },
    { id: 'longhouse5', reward: { wood: 800, stone: 600, food: 400, iron: 0 }, done: (s) => s.level >= 5 },
    { id: 'spearmen5', reward: { wood: 500, stone: 400, food: 300, iron: 0 }, done: (s) => s.troopsTrained === true || (s.fightingLandUnits ?? 0) >= 5 },
    // Needs the trained-troops latch and a started hunt; no claim involved. Demo mode never sets either.
    { id: 'hunt1', reward: { wood: 400, stone: 300, food: 300, iron: 0 }, done: (s) => s.troopsTrained === true && s.huntStarted === true },
];
/** Demo mode: the quest list as the server would report it. */
export function evaluateDemoQuests(state, claimedMask) {
    return QUESTS.map((q, bit) => ({
        id: q.id,
        completed: q.done(state),
        claimed: (claimedMask & (1 << bit)) !== 0,
        reward: { ...q.reward },
    }));
}
/** The bit of `questId` in the claimed mask, or -1 for an unknown quest. */
export function questBit(questId) {
    return QUESTS.findIndex((q) => q.id === questId);
}
/** Whether paying `reward` on top of `stock` would push wood, stone or food past `capacity`. */
export function rewardOverflows(reward, stock, capacity) {
    return ['wood', 'stone', 'food'].some((k) => stock[k] + reward[k] > capacity[k]);
}
