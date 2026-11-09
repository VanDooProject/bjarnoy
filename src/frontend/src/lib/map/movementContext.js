// The PathContext the game prices land routes with: the world's own terrain and river tiles, the backend's
// movement rules (WorldResponse.movement), the wide-river rule (isWideRiverTile, riverGenerator.ts) and the world's standing palisades
// (palisadeMovement.ts). Built once per range-tint recompute / route query, so wideness is memoised per hex.
import { coordKey } from '../hex/coords';
import { bridgeRestrictions } from './bridgeMovement';
import { palisadeRestrictions } from './palisadeMovement';
import { isWideRiverTile } from './riverGenerator';
/**
 * `ownerKey` is the owner of the army that walks (the owning player of the selected settlement, for the range tint): the palisade rules
 * need it to tell a friendly gate from somebody else's. Without it every wall is somebody else's (a gate blocks too).
 * `friendOwners` are the other accounts whose gates open too: the owner's guildmates and the guilds at peace with theirs.
 */
export function gamePathContext(world, rules, hexesPerHour, ownerKey, friendOwners) {
    const riverAt = (c) => world.getRiverTile(c.q, c.r);
    const wide = new Map();
    const terrainAt = (c) => world.getTile(c.q, c.r).terrain;
    const isWideRiver = (c) => {
        const key = coordKey(c);
        let isWide = wide.get(key);
        if (isWide === undefined) {
            const tile = riverAt(c);
            isWide = tile !== undefined && isWideRiverTile(tile, riverAt);
            wide.set(key, isWide);
        }
        return isWide;
    };
    return {
        terrainAt,
        isRiver: (c) => riverAt(c) !== undefined,
        isWideRiver,
        rules,
        hexesPerHour,
        restrictions: mergeRestrictions(palisadeRestrictions(world.standingPalisadeWalls?.() ?? new Map(), terrainAt, isWideRiver, ownerKey ?? '', friendOwners), bridgeRestrictions(world.standingBridges?.() ?? new Map(), ownerKey ?? '', friendOwners)),
    };
}
function mergeRestrictions(...parts) {
    const present = parts.filter((p) => p !== undefined);
    return present.length === 0 ? undefined : Object.assign({}, ...present);
}
