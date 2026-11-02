import { describe, expect, it } from 'vitest';
import { SEA_HEX_COST, SHIP_SETTLER_CAPACITY, TOWER_DEFENCE_PERCENT_PER_LEVEL, minutesPerSeaHex } from './shipDocs';
import units from '../../data/unit-catalogue.json';

describe('shipDocs', () => {
  it('prices a sea hex at 1, so a Karve at speed 8 needs 7.5 minutes and a Longship at 10 needs 6', () => {
    expect(SEA_HEX_COST).toBe(1);
    const speed = (type: string) => units.data.find((u) => u.type === type)!.speed;
    expect(minutesPerSeaHex(speed('karve'))).toBe(7.5);
    expect(minutesPerSeaHex(speed('longship'))).toBe(6);
  });

  it('lets a Karve and a Longship each carry one founding party of five Settlers', () => {
    expect(SHIP_SETTLER_CAPACITY).toEqual({ karve: 5, longship: 5 });
  });

  it('adds 5% defence per Watchtower level', () => {
    expect(TOWER_DEFENCE_PERCENT_PER_LEVEL).toBe(5);
  });
});
