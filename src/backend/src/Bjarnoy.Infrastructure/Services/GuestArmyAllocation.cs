using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Units;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Splits a pooled per-type loss/death count across the actual guest
/// <see cref="ArmyEntity"/> rows present, and applies it — the second half of
/// issue #40 phase 4's cross-aggregate attribution problem (the first half,
/// splitting "home" from "the guest pool", is
/// <see cref="Bjarnoy.Domain.Buildings.Settlement.SettleTo"/>'s starvation
/// pass and <see cref="Bjarnoy.Domain.Armies.Army.SettleArrival"/>'s battle
/// pass; both live in the pure domain since they never need to know
/// individual army identities, only "home" vs "the pool"). This half needs
/// DB-shaped data (which <see cref="ArmyEntity"/> rows exist, what each
/// currently holds) so it lives here in infrastructure, reusing
/// <see cref="ProportionalAllocator"/> for the actual math — used both by
/// <c>SettlementService</c> (starvation) and <c>ArmyService</c> (defensive
/// battle losses).
/// </summary>
internal static class GuestArmyAllocation
{
    /// <summary>
    /// For each entry in <paramref name="pooledLosses"/>, allocates it across
    /// <paramref name="guestArmies"/> proportional to each army's own current
    /// holding of that type, and subtracts the result from that army's
    /// stacks in place. Does not remove now-empty army rows from the
    /// <c>DbContext</c> — callers should look for (and delete) any army left
    /// with no stacks after this returns, same as a wiped-out attacker.
    /// </summary>
    public static void ApplyLosses(IReadOnlyList<ArmyEntity> guestArmies, IReadOnlyList<UnitStack> pooledLosses)
    {
        if (guestArmies.Count == 0 || pooledLosses.Count == 0)
        {
            return;
        }

        foreach (var loss in pooledLosses)
        {
            var weights = guestArmies
                .Select(a => a.Stacks.FirstOrDefault(s => s.UnitType == loss.Type)?.Count ?? 0)
                .ToList();

            var split = ProportionalAllocator.Allocate(loss.Count, weights);

            for (var i = 0; i < guestArmies.Count; i++)
            {
                if (split[i] <= 0)
                {
                    continue;
                }

                var stack = guestArmies[i].Stacks.First(s => s.UnitType == loss.Type);
                stack.Count -= split[i];
            }
        }

        foreach (var army in guestArmies)
        {
            army.Stacks.RemoveAll(s => s.Count <= 0);
        }
    }
}
