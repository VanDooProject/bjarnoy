using System.Security.Claims;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.World;

namespace Bjarnoy.Api.Auth;

/// <summary>
/// What of one rival settlement a caller sees (<c>docs/design/map-fog-v2.md</c> §1h): whether its centre hex lies in the visible area
/// (the caller's explored ground plus where the fog is not yet fully opaque), and the buildings delivered of it. A building outside
/// the visible area is only in <see cref="VisibleBuildings"/> when it is a standing Tower or the Longhouse and its claim disc reaches
/// visible ground; nothing else about an unseen hex (type, level) can leave through a read built on this.
/// </summary>
internal sealed record RivalSettlementSight(
    SettlementEntity Settlement, bool CentreVisible, IReadOnlyList<PlacedBuildingEntity> VisibleBuildings, HexCoord? LabelHex)
{
    public HexCoord Centre => new(Settlement.CentreQ, Settlement.CentreR);

    /// <summary>The delivered buildings that stand (level 1 or more); a foundation alone does not make a settlement visible.</summary>
    public IEnumerable<PlacedBuildingEntity> VisibleStandingBuildings => VisibleBuildings.Where(b => b.Level >= 1);
}

/// <summary>
/// The one fog rule for other players' settlements: a rival is visible when its centre hex, a standing building's hex, or any hex of the
/// claim disc of its Longhouse or one of its towers is in the caller's visible area. A building is delivered when its own hex is in that
/// area; a tower or the Longhouse as soon as any hex of its claim disc is, wherever it stands itself.
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
    /// delivered buildings and, when <paramref name="withLabels"/>, the label hex (null otherwise: only the settlement list reads it). One stored-chunk read covers every rival hex and claim disc at once.
    /// </summary>
    public static async Task<IReadOnlyList<RivalSettlementSight>> ForAsync(
        ExploredAreaService exploredArea,
        ExploredArea area,
        IEnumerable<SettlementEntity> settlements,
        Func<SettlementEntity, bool> isMine,
        bool withLabels,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(exploredArea);
        ArgumentNullException.ThrowIfNull(area);
        ArgumentNullException.ThrowIfNull(settlements);
        ArgumentNullException.ThrowIfNull(isMine);

        var rivals = settlements.Where(s => !isMine(s)).ToList();
        var visible = await exploredArea.VisibleAmongAsync(
            area,
            rivals.SelectMany(s => s.Buildings.Select(b => new HexCoord(b.Q, b.R)).Append(new HexCoord(s.CentreQ, s.CentreR))),
            cancellationToken).ConfigureAwait(false);

        // One group per claim disc (does it reach visible ground), plus one per rival whose centre is not itself visible: its whole
        // claim ordered from the centre outwards, whose first visible hex is where its label goes.
        var groups = new List<IReadOnlyList<HexCoord>>();
        var discGroups = new List<(int Rival, PlacedBuildingEntity Building, int Group)>();
        var labelGroups = new Dictionary<int, int>();
        for (var i = 0; i < rivals.Count; i++)
        {
            var centre = new HexCoord(rivals[i].CentreQ, rivals[i].CentreR);
            var claims = ClaimDiscs(rivals[i]);
            foreach (var (building, disc) in claims)
            {
                discGroups.Add((i, building, groups.Count));
                groups.Add([.. disc.Centre.WithinRadius(disc.Radius)]);
            }

            if (withLabels && !visible.Contains(centre) && claims.Count > 0)
            {
                labelGroups[i] = groups.Count;
                groups.Add(Ordered(claims.SelectMany(c => c.Disc.Centre.WithinRadius(c.Disc.Radius)).Distinct(), centre));
            }
        }

        var first = await exploredArea.FirstVisibleAmongAsync(area, groups, cancellationToken).ConfigureAwait(false);

        var sights = new List<RivalSettlementSight>();
        for (var i = 0; i < rivals.Count; i++)
        {
            var settlement = rivals[i];
            var centre = new HexCoord(settlement.CentreQ, settlement.CentreR);
            var centreVisible = visible.Contains(centre);
            var viaDisc = discGroups.Where(d => d.Rival == i && first[d.Group] is not null).Select(d => d.Building).ToHashSet();
            var delivered = settlement.Buildings
                .Where(b => visible.Contains(new HexCoord(b.Q, b.R)) || viaDisc.Contains(b))
                .ToList();
            var standingVisible = delivered.Where(b => b.Level >= 1 && visible.Contains(new HexCoord(b.Q, b.R)))
                .Select(b => new HexCoord(b.Q, b.R));
            var claimLabel = labelGroups.TryGetValue(i, out var group) ? first[group] : null;

            var seenThroughClaim = viaDisc.Count > 0;
            if (!centreVisible && !seenThroughClaim && !standingVisible.Any())
            {
                continue;
            }

            HexCoord? label = !withLabels
                ? null
                : centreVisible
                ? centre
                : standingVisible.Concat(claimLabel is { } c ? new[] { c } : [])
                    .OrderBy(h => HexCoord.Distance(h, centre)).ThenBy(h => h.Q).ThenBy(h => h.R)
                    .First();
            sights.Add(new RivalSettlementSight(settlement, centreVisible, delivered, label));
        }

        return sights;
    }

    /// <summary>
    /// The claim discs of a rival, read from the catalogue through <see cref="Settlement"/>: the Longhouse's disc around the centre and
    /// one per standing tower, each with the building it belongs to. No chain rule: a cut-off tower still claims what it shows.
    /// </summary>
    private static List<(PlacedBuildingEntity Building, (HexCoord Centre, int Radius) Disc)> ClaimDiscs(SettlementEntity settlement)
    {
        var discs = new List<(PlacedBuildingEntity, (HexCoord, int))>();
        foreach (var building in settlement.Buildings.Where(b => b.Level >= 1))
        {
            if (building.Type is BuildingType.Longhouse or BuildingType.BeachCamp
                && Settlement.CentreDisc(
                    new HexCoord(settlement.CentreQ, settlement.CentreR), building.Type == BuildingType.Longhouse ? building.Level : 0,
                    building.Type == BuildingType.BeachCamp) is { } centreDisc)
            {
                discs.Add((building, centreDisc));
            }
            else if (building.Type == BuildingType.Tower)
            {
                discs.Add((building, (new HexCoord(building.Q, building.R), Settlement.TowerClaimRadius(building.Level))));
            }
        }

        return discs;
    }

    private static List<HexCoord> Ordered(IEnumerable<HexCoord> hexes, HexCoord from) =>
        [.. hexes.OrderBy(h => HexCoord.Distance(h, from)).ThenBy(h => h.Q).ThenBy(h => h.R)];
}
