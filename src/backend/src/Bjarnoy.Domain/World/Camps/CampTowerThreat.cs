namespace Bjarnoy.Domain.World;

/// <summary>Whether a tower a camp may attack already stands or is still being built.</summary>
public enum CampTowerKind
{
    /// <summary>A finished tower (also a standing one with an upgrade order).</summary>
    Standing,

    /// <summary>A tower whose first construction is under way (a started order, no finished level yet).</summary>
    UnderConstruction,
}

/// <summary>A tower of some settlement that an aggressive camp may attack.</summary>
/// <param name="StartedAt">When construction started (only read for <see cref="CampTowerKind.UnderConstruction"/>).</param>
public readonly record struct CampTowerTarget(Guid SettlementId, HexCoord Hex, CampTowerKind Kind, DateTimeOffset? StartedAt);

/// <summary>One camp's attack on one tower that is due.</summary>
public readonly record struct CampTowerAttack(Camp Camp, CampTowerTarget Tower);

/// <summary>
/// Which tower attacks are due at an instant (<c>docs/design/wildlife-camps.md</c>, "Strong camps attack"). Pure:
/// the caller loads camps, states and towers and fights what comes back.
/// </summary>
public static class CampTowerThreat
{
    /// <summary>
    /// The attacks due at <paramref name="now"/>. Each aggressive strong camp makes at most one (it is calm
    /// afterwards), on a due tower within its <see cref="Camp.GuardRange"/>: a standing tower at once, a tower under
    /// construction <see cref="CampRules.TowerAttackDelay"/> after its construction started. The closest due tower
    /// is chosen, ties by lower q then r then settlement id; camps are served in q, r order and a tower already chosen
    /// by an earlier camp is not attacked twice in one scan (the later camp tries again next scan).
    /// </summary>
    public static IReadOnlyList<CampTowerAttack> Due(
        IEnumerable<(Camp Camp, CampState State)> camps,
        Func<HexCoord, bool> insideRealm,
        IReadOnlyList<CampTowerTarget> towers,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(camps);
        ArgumentNullException.ThrowIfNull(insideRealm);
        ArgumentNullException.ThrowIfNull(towers);

        var due = towers.Where(t => IsDue(t, now)).ToList();
        var taken = new HashSet<(Guid, HexCoord)>();
        var attacks = new List<CampTowerAttack>();

        foreach (var (camp, state) in camps.OrderBy(c => c.Camp.Coord.Q).ThenBy(c => c.Camp.Coord.R))
        {
            if (!state.IsAggressiveAt(camp, now, insideRealm(camp.Coord)))
            {
                continue;
            }

            var target = due
                .Where(t => camp.Coord.DistanceTo(t.Hex) <= camp.GuardRange && !taken.Contains((t.SettlementId, t.Hex)))
                .OrderBy(t => camp.Coord.DistanceTo(t.Hex))
                .ThenBy(t => t.Hex.Q)
                .ThenBy(t => t.Hex.R)
                .ThenBy(t => t.SettlementId)
                .Cast<CampTowerTarget?>()
                .FirstOrDefault();

            if (target is { } chosen)
            {
                taken.Add((chosen.SettlementId, chosen.Hex));
                attacks.Add(new CampTowerAttack(camp, chosen));
            }
        }

        return attacks;
    }

    private static bool IsDue(CampTowerTarget tower, DateTimeOffset now) =>
        tower.Kind == CampTowerKind.Standing
        || (tower.StartedAt is { } started && started + CampRules.TowerAttackDelay <= now);
}
