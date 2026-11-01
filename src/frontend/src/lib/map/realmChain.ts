// The chain rule — a client-side mirror of the backend's
// `Bjarnoy.Domain.Buildings.ConnectedRealm` (see that file's doc comment and
// docs/design/economy.md section 5, "Towers have to be chained to a
// longhouse"). A tower claims its ground only while it is CONNECTED: it stands
// on ground claimed by one of the player's longhouses, or by a tower that is
// itself connected. All of one player's settlements on one island are resolved
// together, so a chain reached by a longhouse from either end stays connected
// when a tower in the middle falls.
//
// Pure and unit-testable with plain data (`realmChain.test.ts`); `WorldModel`
// feeds it the settlements it knows and every consumer of a claim or of a
// tower's vision reads the answer from here.
import { hexDistance, type AxialCoord } from '../hex/coords';
import { claimRadiusForLevel, towerClaimRadiusForLevel, type ClaimDisc } from './shoreline';

/** One settlement as the chain rule sees it: its longhouse hex and level, and its standing towers (level 1 or more). */
export interface RealmSettlementInput {
  id: string;
  q: number;
  r: number;
  level: number;
  towers: ReadonlyArray<{ q: number; r: number; level: number }>;
}

/** The result of `resolveRealm`: which towers are connected and which discs the realm covers. */
export interface ConnectedRealm {
  /** Every connected disc of the player's settlements on the island (longhouse discs and connected towers' discs). */
  allDiscs: ClaimDisc[];
  /** The connected discs one settlement contributes: its longhouse disc first, then its connected towers' discs. */
  discsOf(settlementId: string): ClaimDisc[];
  /** Whether the standing tower (level 1 or more) of `settlementId` on `at` is connected. */
  isTowerConnected(settlementId: string, at: AxialCoord): boolean;
  /** Whether `at` lies inside a connected disc of the realm (plain distance test; a tower is never on a giant). */
  covers(at: AxialCoord): boolean;
  /** Number of distinct hexes of `towerHexes` (standing towers and queued tower orders) that are connected — the ones that count against the tower limit. */
  countConnected(towerHexes: Iterable<AxialCoord>): number;
}

function coveredBy(discs: readonly ClaimDisc[], at: AxialCoord): boolean {
  for (const disc of discs) {
    if (hexDistance({ q: disc.q, r: disc.r }, at) <= disc.radius) return true;
  }
  return false;
}

const towerKey = (id: string, q: number, r: number) => `${id}|${q},${r}`;

/**
 * Resolves one player's settlements on one island. Starting from every
 * longhouse disc, any standing tower whose own hex lies inside a disc already
 * reached joins, and its disc with it, until nothing changes (a fixed point).
 * Pass only settlements of ONE player on ONE island: another player's
 * longhouse never connects your towers, and a tower on another island never
 * connects.
 */
export function resolveRealm(settlements: readonly RealmSettlementInput[]): ConnectedRealm {
  const discsBySettlement = new Map<string, ClaimDisc[]>();
  const reached: ClaimDisc[] = [];
  const pending: Array<{ id: string; q: number; r: number; level: number }> = [];

  for (const s of settlements) {
    const centre: ClaimDisc = { q: s.q, r: s.r, radius: claimRadiusForLevel(s.level) };
    discsBySettlement.set(s.id, [centre]);
    reached.push(centre);
    for (const t of s.towers) {
      if (t.level >= 1) pending.push({ id: s.id, q: t.q, r: t.r, level: t.level });
    }
  }

  const connected = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const t = pending[i]!;
      if (!coveredBy(reached, t)) continue;
      const disc: ClaimDisc = { q: t.q, r: t.r, radius: towerClaimRadiusForLevel(t.level) };
      discsBySettlement.get(t.id)!.push(disc);
      reached.push(disc);
      connected.add(towerKey(t.id, t.q, t.r));
      pending.splice(i, 1);
      progressed = true;
    }
  }

  return {
    allDiscs: reached,
    discsOf: (id) => discsBySettlement.get(id) ?? [],
    isTowerConnected: (id, at) => connected.has(towerKey(id, at.q, at.r)),
    covers: (at) => coveredBy(reached, at),
    countConnected(towerHexes) {
      const seen = new Set<string>();
      for (const h of towerHexes) {
        const key = `${h.q},${h.r}`;
        if (seen.has(key)) continue;
        if (coveredBy(reached, h)) seen.add(key);
      }
      return seen.size;
    },
  };
}
