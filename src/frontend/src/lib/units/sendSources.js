import { canFieldOrderArmy, garrisonCanHunt, isFieldOrderMidMarch } from './armyDispatch';
import { fieldOrderFeasibility } from './fieldOrderFeasibility';
/** Every source for `target`: home first, then the field armies that can go (quickest first), then those that cannot. */
export function evaluateSendSources(input) {
    const { target, garrison, armies, isPremium, byType, env } = input;
    const homeUnits = garrison.filter((g) => g.count > 0);
    const homeBlock = homeUnits.length === 0 ? 'noUnits' : target.mission === 'hunt' && !garrisonCanHunt(garrison, byType, target.campAtSea) ? 'wrongClass' : undefined;
    const home = {
        id: 'home',
        kind: 'home',
        ok: !homeBlock,
        block: homeBlock,
        locked: false,
        standing: false,
        travelMinutes: null,
    };
    const field = armies
        .filter((a) => !a.atHome)
        .map((army) => {
        const base = { id: army.id, kind: 'field', army, standing: !isFieldOrderMidMarch(army, env.now) };
        const blocked = (block, verdict) => ({
            ...base,
            ok: false,
            block,
            locked: block === 'premium',
            travelMinutes: verdict?.ok ? verdict.travelMinutes : null,
            verdict,
        });
        if (target.mission === 'hunt' && !garrisonCanHunt(army.stacks, byType, target.campAtSea))
            return blocked('wrongClass');
        if (army.supporting)
            return blocked('supporting');
        if (army.movement?.isReturning)
            return blocked('returning');
        if (!canFieldOrderArmy(army))
            return blocked('notOrderable');
        const verdict = fieldOrderFeasibility(army, target.coord, target.mission, env);
        if (!base.standing && !isPremium)
            return blocked('premium', verdict);
        if (!verdict.ok)
            return blocked(verdict.reason, verdict);
        return { ...base, ok: true, locked: false, travelMinutes: verdict.travelMinutes, verdict };
    });
    field.sort((a, b) => Number(b.ok) - Number(a.ok) ||
        (a.travelMinutes ?? Number.POSITIVE_INFINITY) - (b.travelMinutes ?? Number.POSITIVE_INFINITY) ||
        a.id.localeCompare(b.id));
    return [home, ...field];
}
/** Whether at least one source can go: the ring's bubble is enabled exactly then. */
export function anySendSourceCanGo(sources) {
    return sources.some((s) => s.ok);
}
