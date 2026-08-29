namespace Bjarnoy.Domain.Combat;

/// <summary>
/// Splits a pooled integer total across several sources' pre-event weights of
/// the same thing, proportionally, so the pieces always sum back to exactly
/// <c>total</c> — issue #40 phase 4's answer to "a settlement's starvation
/// pass (or a defensive battle) computes one pooled death/loss count per unit
/// type across home garrison + guest armies; who actually lost how many?"
/// </summary>
/// <remarks>
/// <para>
/// Used in two places, both cross-aggregate attribution problems with the
/// same shape: <c>Settlement</c>'s starvation pass splits pooled per-type
/// deaths between the home garrison and the pooled guest total (see
/// <c>Settlement.SettleTo</c>'s <c>guestStacks</c> parameter), and
/// <c>Army.SettleArrival</c> splits a defensive battle's pooled per-type
/// losses/survivors between the home garrison and the pooled guest total. A
/// second pass (in the infrastructure layer, where individual guest
/// <c>ArmyEntity</c> rows are visible) reuses this same allocator to split
/// the guest pool's share across the actual guest armies present.
/// </para>
/// <para>
/// Each weight's exact share (<c>weight * total / sumWeights</c>) is floored
/// first, which systematically undercounts the total by the sum of the
/// fractional remainders. The rounding remainder is handed out one at a time
/// to the sources with the largest fractional remainder first — the
/// "largest remainder method" — with ties broken by ascending source index
/// so the same inputs always split the same way. No randomness is needed
/// (unlike <see cref="BattleResolver"/>'s own proportional-loss split, which
/// breaks ties with an RNG): source order here is already a stable,
/// deterministic key, so an index-based tiebreak is enough.
/// </para>
/// </remarks>
public static class ProportionalAllocator
{
    /// <summary>
    /// Allocates <paramref name="total"/> across <paramref name="weights"/>,
    /// proportional to each weight, summing to exactly
    /// <c>Math.Min(total, sum(weights))</c> and never exceeding any
    /// individual weight.
    /// </summary>
    public static int[] Allocate(int total, IReadOnlyList<int> weights)
    {
        ArgumentNullException.ThrowIfNull(weights);

        var result = new int[weights.Count];
        var sumWeights = weights.Sum();
        if (total <= 0 || sumWeights <= 0)
        {
            return result;
        }

        total = Math.Min(total, sumWeights);

        var exact = new double[weights.Count];
        for (var i = 0; i < weights.Count; i++)
        {
            exact[i] = weights[i] * (double)total / sumWeights;
            result[i] = (int)Math.Floor(exact[i]);
        }

        var remainder = total - result.Sum();
        var order = Enumerable.Range(0, weights.Count)
            .OrderByDescending(i => exact[i] - result[i])
            .ThenBy(i => i)
            .ToList();

        for (var k = 0; k < remainder && k < order.Count; k++)
        {
            var index = order[k];
            if (result[index] < weights[index])
            {
                result[index]++;
            }
        }

        return result;
    }
}
