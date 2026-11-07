// The chain rule — a client-side mirror of the backend's
// `Bjarnoy.Domain.Buildings.ConnectedRealm` (see that file's doc comment and
// docs/design/economy.md section 5, "Towers have to be chained to a
// longhouse"). A tower claims its ground only while it is CONNECTED: it stands
// on ground claimed by one of the player's longhouses, or by a tower that is
// itself connected. All of one player's settlements on one island are resolved
// together, so a chain reached by a longhouse from either end stays connected
// when a tower in the middle falls.
//
// Pure and unit-testable with plain data (`realmChain.test.ts`); every
// consumer of a claim or of a tower's vision reads the answer from here.
// Live mode takes the realm the server resolved (`realmFromDiscs`, the discs
// of `SettlementResponse.realm`: the client only knows the selected
// settlement's towers, so it cannot rebuild the realm itself); demo mode
// resolves it locally from the settlements the model knows (`resolveRealm`).
import { hexDistance } from '../hex/coords';
import { longhouseDiscs, towerClaimRadiusForLevel } from './shoreline';
function coveredBy(discs, at) {
    for (const disc of discs) {
        if (hexDistance({ q: disc.q, r: disc.r }, at) <= disc.radius)
            return true;
    }
    return false;
}
const towerKey = (id, q, r) => `${id}|${q},${r}`;
/**
 * Resolves one player's settlements on one island. Starting from every
 * longhouse disc, any standing tower whose own hex lies inside a disc already
 * reached joins, and its disc with it, until nothing changes (a fixed point).
 * Pass only settlements of ONE player on ONE island: another player's
 * longhouse never connects your towers, and a tower on another island never
 * connects.
 */
export function resolveRealm(settlements) {
    const discsBySettlement = new Map();
    const reached = [];
    const pending = [];
    for (const s of settlements) {
        // A settlement whose Longhouse is destroyed (level 0) contributes no disc; its towers can still be reached by another
        // longhouse of the player.
        const centre = longhouseDiscs({ q: s.q, r: s.r }, s.level);
        discsBySettlement.set(s.id, centre);
        reached.push(...centre);
        for (const t of s.towers) {
            if (t.level >= 1)
                pending.push({ id: s.id, q: t.q, r: t.r, level: t.level });
        }
    }
    const connected = new Set();
    let progressed = true;
    while (progressed) {
        progressed = false;
        for (let i = pending.length - 1; i >= 0; i--) {
            const t = pending[i];
            if (!coveredBy(reached, t))
                continue;
            const disc = { q: t.q, r: t.r, radius: towerClaimRadiusForLevel(t.level) };
            discsBySettlement.get(t.id).push(disc);
            reached.push(disc);
            connected.add(towerKey(t.id, t.q, t.r));
            pending.splice(i, 1);
            progressed = true;
        }
    }
    return buildRealm(reached, discsBySettlement, (id, at) => connected.has(towerKey(id, at.q, at.r)));
}
/**
 * The realm the server resolved: each member's connected discs, longhouse disc first (none when its Longhouse is destroyed),
 * then one per connected tower. A tower is connected when a disc of its settlement is centred on its hex (a tower never
 * stands on the longhouse's own hex).
 */
export function realmFromDiscs(members) {
    const discsBySettlement = new Map();
    const reached = [];
    for (const m of members) {
        discsBySettlement.set(m.settlementId, m.discs.map((d) => ({ q: d.q, r: d.r, radius: d.radius })));
        reached.push(...(discsBySettlement.get(m.settlementId) ?? []));
    }
    return buildRealm(reached, discsBySettlement, (id, at) => (discsBySettlement.get(id) ?? []).some((d) => d.q === at.q && d.r === at.r));
}
/** The `ConnectedRealm` over resolved discs — the one place `covers`, `countConnected` and `discsOf` are built. */
function buildRealm(reached, discsBySettlement, isTowerConnected) {
    return {
        allDiscs: reached,
        discsOf: (id) => discsBySettlement.get(id) ?? [],
        isTowerConnected,
        covers: (at) => coveredBy(reached, at),
        countConnected(towerHexes) {
            const seen = new Set();
            for (const h of towerHexes) {
                const key = `${h.q},${h.r}`;
                if (seen.has(key))
                    continue;
                if (coveredBy(reached, h))
                    seen.add(key);
            }
            return seen.size;
        },
    };
}
