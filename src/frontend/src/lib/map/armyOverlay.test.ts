import { describe, expect, it } from 'vitest';
import type { ForeignArmyResponse } from '../../api/types';
import { armyOverlayMovement, campArmyMarkers, campFleetLiveCoord, campFleetMovement, campLandMarkerId, foreignArmyMarker } from './armyOverlay';
import type { ArmyOverlayMarker } from './HexMapRenderer';
import { GUILD_REALM_COLOR, OWN_REALM_COLOR, RIVAL_REALM_COLOR, TREATY_REALM_COLOR } from './realmColours';

const army: ForeignArmyResponse = {
  id: 'army-x',
  settlementId: 'rival-1',
  relation: 'rival',
  isFleet: true,
  position: { q: 3, r: 0 },
  movement: {
    departedAt: '2026-01-01T04:00:00Z',
    path: [
      { q: 3, r: 0 },
      { q: 2, r: 0 },
    ],
    cumulativeHours: [0, 1],
    edgeHours: [0, 0.5],
    arrivesAt: '2026-01-01T05:00:00Z',
  },
};

describe('foreignArmyMarker', () => {
  it('is a foreign, never selected marker on the stretch it was given, ship or flag as sent', () => {
    const marker = foreignArmyMarker(army);

    expect(marker).toMatchObject({ id: 'army-x', foreign: true, selected: false, returning: false, isFleet: true, position: { q: 3, r: 0 } });
    expect(marker.movement).toEqual({
      path: [
        { q: 3, r: 0 },
        { q: 2, r: 0 },
      ],
      cumulativeHours: [0, 1],
      edgeHours: [0, 0.5],
      departedAtMs: Date.parse('2026-01-01T04:00:00Z'),
      arrivesAtMs: Date.parse('2026-01-01T05:00:00Z'),
    });
  });

  it('wears the colour of how its owner stands to the player, as the server sends it', () => {
    expect(foreignArmyMarker({ ...army, relation: 'guild' }).color).toBe(GUILD_REALM_COLOR);
    expect(foreignArmyMarker({ ...army, relation: 'treaty' }).color).toBe(TREATY_REALM_COLOR);
    expect(foreignArmyMarker({ ...army, relation: 'mine' }).color).toBe(OWN_REALM_COLOR);
    expect(foreignArmyMarker(army).color).toBe(RIVAL_REALM_COLOR);
  });

  it('wears its owner\'s colour without a home too', () => {
    expect(foreignArmyMarker({ ...army, settlementId: null, relation: 'guild' }).color).toBe(GUILD_REALM_COLOR);
  });
});

describe('armyOverlayMovement', () => {
  it('falls back to empty schedules when the hours are missing', () => {
    const m = armyOverlayMovement({ path: [{ q: 0, r: 0 }], departedAt: '2026-01-01T00:00:00Z', arrivesAt: '2026-01-01T00:00:00Z' });
    expect(m.cumulativeHours).toEqual([]);
    expect(m.edgeHours).toEqual([]);
  });
});

describe('camp army markers', () => {
  // Home (0,0) -> two water hexes -> the camp's sand hex (3,0); the sand hex costs 2: hours 0, 1, 2, 4.
  const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
  const departedAt = '2026-01-01T00:00:00Z';
  const arrivesAt = '2026-01-01T04:00:00Z';
  const base = Date.parse(departedAt);
  const hour = 3_600_000;
  const movement = { path, cumulativeHours: [0, 1, 2, 4], edgeHours: [0, 0.5, 1.5, 3], departedAt, arrivesAt };
  const marker = (isFleet: boolean): ArmyOverlayMarker => ({
    id: 'a1',
    position: { q: 3, r: 0 },
    selected: true,
    pick: 'eligible',
    returning: false,
    isFleet,
    visionRadius: 3,
    movement: armyOverlayMovement(movement),
  });
  const army = (patch: Partial<{ mission: string; isReturning: boolean }> = {}) => ({
    mission: patch.mission ?? 'setupcamp',
    movement: { ...movement, isReturning: patch.isReturning ?? false },
  });

  it('stops the fleet\'s leg one hex short, at the schedule\'s own time for the water hex', () => {
    const trimmed = campFleetMovement(armyOverlayMovement(movement));
    expect(trimmed.path).toEqual(path.slice(0, 3));
    expect(trimmed.cumulativeHours).toEqual([0, 1, 2]);
    expect(trimmed.edgeHours).toEqual([0, 0.5, 1.5]);
    expect(trimmed.arrivesAtMs).toBe(base + 2 * hour);
  });

  it('draws a fleet on its way on the trimmed leg, and no land marker before it has arrived', () => {
    const markers = campArmyMarkers(marker(true), army(), base + hour);
    expect(markers).toHaveLength(1);
    expect(markers[0].id).toBe('a1');
    expect(markers[0].position).toEqual({ q: 2, r: 0 });
    expect(markers[0].movement?.path).toHaveLength(3);
  });

  it('puts the arrived fleet on the second-to-last hex and its troops on the camp hex', () => {
    const [fleet, land] = campArmyMarkers(marker(true), army(), Date.parse(arrivesAt) + 1000);
    expect(fleet).toMatchObject({ id: 'a1', isFleet: true, position: { q: 2, r: 0 }, visionRadius: 3 });
    expect(land).toMatchObject({ id: campLandMarkerId('a1'), isFleet: false, position: { q: 3, r: 0 }, selected: true });
    // The land half is a plain standing marker: not tappable, no leg of its own.
    expect(land.pick).toBeUndefined();
    expect(land.movement).toBeUndefined();
  });

  it('leaves a land army on the camp hex', () => {
    const land = marker(false);
    expect(campArmyMarkers(land, army(), Date.parse(arrivesAt) + 1000)).toEqual([land]);
  });

  it('leaves a recalled camp army and any other mission alone', () => {
    const fleet = marker(true);
    expect(campArmyMarkers(fleet, army({ isReturning: true }), Date.parse(arrivesAt) + 1000)).toEqual([fleet]);
    expect(campArmyMarkers(fleet, army({ mission: 'found' }), Date.parse(arrivesAt) + 1000)).toEqual([fleet]);
  });

  it('reads the live coord of a camp fleet off the trimmed leg, never the camp hex', () => {
    const a = { position: { q: 0, r: 0 }, movement };
    expect(campFleetLiveCoord(a, base + 0.4 * hour)).toEqual({ q: 0, r: 0 });
    expect(campFleetLiveCoord(a, base + 1.9 * hour)).toEqual({ q: 2, r: 0 });
    // Past the whole leg the fleet rests on the water hex, where campArmyMarkers draws it.
    expect(campFleetLiveCoord(a, Date.parse(arrivesAt) + hour)).toEqual({ q: 2, r: 0 });
  });
});
