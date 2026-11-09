using System.Security.Claims;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.World;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// What of one rival settlement a caller has explored: whether its centre hex is, and the buildings whose own hex is. A building on an
/// unexplored hex is never in <see cref="ExploredBuildings"/>, so nothing about it (type, level) can leave through a read built on this.
/// </summary>
internal sealed record RivalSettlementSight(
    SettlementEntity Settlement, bool CentreExplored, IReadOnlyList<PlacedBuildingEntity> ExploredBuildings)
{
    public HexCoord Centre => new(Settlement.CentreQ, Settlement.CentreR);

    /// <summary>The standing (level 1 or more) explored buildings; a foundation alone does not make a settlement visible.</summary>
    public IEnumerable<PlacedBuildingEntity> ExploredStandingBuildings => ExploredBuildings.Where(b => b.Level >= 1);

    /// <summary>
    /// The hex a client puts the settlement's label on: the centre when it is explored, else the explored standing building
    /// closest to the centre (the lowest q, then r, among equals, so it is stable between reads).
    /// </summary>
    public HexCoord LabelHex => CentreExplored
        ? Centre
        : ExploredStandingBuildings
            .Select(b => new HexCoord(b.Q, b.R))
            .OrderBy(h => HexCoord.Distance(h, Centre)).ThenBy(h => h.Q).ThenBy(h => h.R)
            .First();
}

/// <summary>
/// The one fog rule for other players' settlements: a rival is visible when its centre hex or any of its standing buildings' hexes is in
/// the caller's explored area, and what is delivered of it is decided hex by hex.
/// </summary>
internal static class RivalVisibility
{
    /// <summary>The account id of an authenticated caller, or null.</summary>
    public static Guid? CallerUserId(ClaimsPrincipal user)
    {
        ArgumentNullException.ThrowIfNull(user);
        var idClaim = user.Identity?.IsAuthenticated == true ? user.FindFirstValue(ClaimTypes.NameIdentifier) : null;
        return Guid.TryParse(idClaim, out var parsed) ? parsed : null;
    }

    /// <summary>Whether <paramref name="settlement"/> is the caller's own: their realm's owner id, or their account.</summary>
    public static bool IsMine(SettlementEntity settlement, string realmOwnerId, Guid? callerUserId)
    {
        ArgumentNullException.ThrowIfNull(settlement);
        return settlement.OwnerId == realmOwnerId || (callerUserId is not null && settlement.UserId == callerUserId);
    }

    /// <summary>
    /// The visible rivals among <paramref name="settlements"/> (the caller's own dropped by <paramref name="isMine"/>), each with its
    /// explored centre flag and explored buildings. One explored lookup covers every rival centre and building hex at once.
    /// </summary>
    public static async Task<IReadOnlyList<RivalSettlementSight>> ForAsync(
        ExploredAreaService exploredArea,
        ExploredArea area,
        IEnumerable<SettlementEntity> settlements,
        Func<SettlementEntity, bool> isMine,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(exploredArea);
        ArgumentNullException.ThrowIfNull(area);
        ArgumentNullException.ThrowIfNull(settlements);
        ArgumentNullException.ThrowIfNull(isMine);

        var rivals = settlements.Where(s => !isMine(s)).ToList();
        var explored = await exploredArea.ExploredAmongAsync(
            area,
            rivals.SelectMany(s => s.Buildings.Select(b => new HexCoord(b.Q, b.R)).Append(new HexCoord(s.CentreQ, s.CentreR))),
            cancellationToken).ConfigureAwait(false);

        return
        [
            .. rivals
                .Select(s => new RivalSettlementSight(
                    s,
                    explored.Contains(new HexCoord(s.CentreQ, s.CentreR)),
                    [.. s.Buildings.Where(b => explored.Contains(new HexCoord(b.Q, b.R)))]))
                .Where(sight => sight.CentreExplored || sight.ExploredStandingBuildings.Any()),
        ];
    }
}
