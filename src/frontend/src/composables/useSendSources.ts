// The sources (home garrison and field armies) that can be sent at a target, evaluated against the live world: the pathfinder the
// range tint uses (`gamePathContext`) plus the shared rules in lib/units/sendSources.ts. Used by the source picker (the rows) and by
// MapView (which markers are tappable) so both read one answer. Not by the ring menu: opening a ring runs no route search.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useWorldStore } from '../stores/world';
import { useAuthStore } from '../stores/auth';
import { useGuildStore } from '../stores/guild';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import type { AxialCoord } from '../lib/hex/coords';
import { findPath, findSeaPath, pathCost } from '../lib/map/hexPath';
import { gamePathContext } from '../lib/map/movementContext';
import { isWaterCampFamily } from '../lib/map/campPlacement';
import { fieldOrderFeasibility, type FeasibilityArmy, type FeasibilityEnv, type SendMission } from '../lib/units/fieldOrderFeasibility';
import { evaluateSendSources, type SendSource, type SendTarget } from '../lib/units/sendSources';

export function useSendSources() {
  const world = useWorldStore();
  const auth = useAuthStore();
  const guild = useGuildStore();
  const catalogue = useUnitCatalogueStore();

  /** The target a ring action or the open picker aims at; a hunt at a camp on the sea is sent ships, not land units. */
  function targetAt(mission: SendMission, coord: AxialCoord): SendTarget {
    const camp = mission === 'hunt' ? world.model.campAt(coord) : undefined;
    return { mission, coord, campAtSea: !!camp && isWaterCampFamily(camp.family) };
  }

  function env(): FeasibilityEnv {
    const home = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
    // Prices only: the pace comes from the leaving units, so the context runs at one hex an hour.
    const ctx = gamePathContext(
      world.model,
      { land: world.movementRules.land, riverCrossingCost: world.movementRules.riverCrossingCost },
      1,
      home?.ownerId,
      guild.friendlyUserIds,
    );
    return {
      byType: catalogue.byType,
      worldSpeedFactor: world.worldSpeedFactor,
      now: Date.now(),
      route: (from, to, fleet) => {
        const path = fleet ? findSeaPath(from, to, (c) => world.model.getTile(c.q, c.r).terrain) : findPath(from, to, ctx);
        if (!path) return null;
        const cost = fleet ? path.length - 1 : pathCost(path, ctx);
        return Number.isFinite(cost) ? { path, cost } : null;
      },
    };
  }

  function evaluate(target: SendTarget) {
    return evaluateSendSources({
      target,
      garrison: world.hud.garrison,
      armies: world.armies,
      isPremium: auth.isPremium,
      byType: catalogue.byType,
      env: env(),
    });
  }

  /** The verdict for sending only `units` of a field army (the picker's steppers), re-run on every change. */
  function verdictFor(army: FeasibilityArmy, target: SendTarget, units?: Record<string, number>) {
    return fieldOrderFeasibility(army, target.coord, target.mission, env(), units);
  }

  return { targetAt, evaluate, verdictFor };
}

/** The open send picker's target and its source rows (empty while no picker is open). */
export function useSendPickerRows() {
  const world = useWorldStore();
  const sources = useSendSources();
  const target = computed(() => (world.sendPicker ? sources.targetAt(world.sendPicker.mission, world.sendPicker.coord) : null));
  const rows = computed(() => (target.value ? sources.evaluate(target.value) : []));
  return { target, rows, verdictFor: sources.verdictFor };
}

/** Why a source cannot go, in words: the picker's dimmed rows and the hint over a faded army marker read the same text. */
export function useSendBlockText() {
  const world = useWorldStore();
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  return (source: SendSource, target: SendTarget | null): string => {
    switch (source.block) {
      case 'noUnits':
        return t('hud.sendPicker.reasons.noUnitsAtHome');
      case 'wrongClass':
        return t(target?.campAtSea ? 'hud.sendPicker.reasons.noShips' : 'hud.sendPicker.reasons.noLandUnits');
      case 'supporting': {
        const name = source.army?.targetSettlementId ? world.model.getSettlement(source.army.targetSettlementId)?.name : undefined;
        return name ? t('hud.sendPicker.reasons.supportingNamed', { name }) : t('hud.sendPicker.reasons.supporting');
      }
      case 'returning':
        return t('hud.sendPicker.reasons.returning');
      case 'notOrderable':
        return t('hud.sendPicker.reasons.notOrderable');
      case 'premium':
        return t('hud.sendPicker.reasons.premium');
      case 'unreachable':
        return t('hud.sendPicker.reasons.unreachable');
      case 'noFood':
        return t('hud.sendPicker.reasons.noFood');
      default:
        return '';
    }
  };
}
