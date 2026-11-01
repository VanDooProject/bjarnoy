using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>
/// One settlement as the chain rule sees it: its id, its longhouse hex and what stands on it. All of one player's
/// settlements on one island are resolved together (<see cref="ConnectedRealm.Resolve"/>).
/// </summary>
public readonly record struct RealmSettlement(Guid Id, HexCoord Centre, IReadOnlyList<PlacedBuilding> Buildings);

/// <summary>
/// The chain rule (<c>docs/design/economy.md</c> section 5, "Towers have to be chained to a longhouse"): a tower claims
/// its ground only while it is <em>connected</em>, i.e. it stands on ground claimed by one of the player's longhouses
/// or by a tower that is itself connected. All of the player's longhouses on the island count, so a chain reached by a
/// longhouse from either end stays connected when a tower in the middle falls.
/// </summary>
/// <remarks>
/// Pure: the caller hands over every settlement of one player on one island (and nothing else; another player's
/// longhouse never connects your towers, a tower on another island never connects). Starting from every longhouse disc
/// (<see cref="Settlement.ClaimRadiusForLonghouseLevel"/>), any standing tower (level 1 or more) whose own hex lies
/// inside a disc already reached joins, and its disc (<see cref="Settlement.TowerClaimRadius"/>) with it, until nothing
/// changes. A level-0 stub claims nothing (radius 0) and never joins. The client mirrors this in
/// <c>lib/map/realmChain.ts</c>.
/// </remarks>
public sealed class ConnectedRealm
{
    private readonly Dictionary<Guid, List<(HexCoord Centre, int Radius)>> _discsBySettlement;
    private readonly List<(HexCoord Centre, int Radius)> _allDiscs;
    private readonly HashSet<(Guid SettlementId, HexCoord Coord)> _connectedTowers;

    private ConnectedRealm(
        Dictionary<Guid, List<(HexCoord Centre, int Radius)>> discsBySettlement,
        HashSet<(Guid SettlementId, HexCoord Coord)> connectedTowers)
    {
        _discsBySettlement = discsBySettlement;
        _connectedTowers = connectedTowers;
        _allDiscs = [.. discsBySettlement.Values.SelectMany(d => d)];
    }

    /// <summary>Every connected disc of the player's settlements on the island (longhouse discs and connected towers' discs).</summary>
    public IReadOnlyList<(HexCoord Centre, int Radius)> AllDiscs => _allDiscs;

    /// <summary>The connected discs <paramref name="settlementId"/> contributes: its longhouse disc first, then its connected towers'.</summary>
    public IReadOnlyList<(HexCoord Centre, int Radius)> DiscsOf(Guid settlementId) =>
        _discsBySettlement.TryGetValue(settlementId, out var discs) ? discs : [];

    /// <summary>Whether the standing tower (level 1 or more) of <paramref name="settlementId"/> on <paramref name="coord"/> is connected.</summary>
    public bool IsTowerConnected(Guid settlementId, HexCoord coord) => _connectedTowers.Contains((settlementId, coord));

    /// <summary>
    /// Whether <paramref name="coord"/> lies inside a connected disc of the realm (plain distance test; a tower is never on a
    /// giant). For a standing tower this equals <see cref="IsTowerConnected"/>; for a level-0 stub or a queued tower it says
    /// whether the hex it stands on is claimed, which is what counts it against the tower limit.
    /// </summary>
    public bool Covers(HexCoord coord)
    {
        foreach (var (centre, radius) in _allDiscs)
        {
            if (centre.DistanceTo(coord) <= radius)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// The number of distinct tower hexes among <paramref name="towerHexes"/> (a settlement's standing towers and queued
    /// tower orders) that are connected, i.e. count against its tower limit.
    /// </summary>
    public int CountConnected(IEnumerable<HexCoord> towerHexes) => towerHexes.Distinct().Count(Covers);

    /// <summary>
    /// The highest level among <paramref name="buildings"/>' towers that are connected (0 when none is): the tower level the
    /// siege defence bonus reads. A cut-off tower gives no bonus.
    /// </summary>
    public int HighestConnectedTowerLevel(Guid settlementId, IEnumerable<PlacedBuilding> buildings) =>
        buildings
            .Where(b => b.Type == BuildingType.Tower && IsTowerConnected(settlementId, b.Coord))
            .Select(b => b.Level)
            .DefaultIfEmpty(0)
            .Max();

    /// <summary>Resolves one player's settlements on one island.</summary>
    public static ConnectedRealm Resolve(IEnumerable<RealmSettlement> settlements)
    {
        ArgumentNullException.ThrowIfNull(settlements);

        var list = settlements.ToList();
        var discs = new Dictionary<Guid, List<(HexCoord Centre, int Radius)>>();
        var pending = new List<(Guid Id, HexCoord Coord, int Level)>();
        var reached = new List<(HexCoord Centre, int Radius)>();

        foreach (var settlement in list)
        {
            var longhouseLevel = settlement.Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse).Level;
            var centreDisc = (settlement.Centre, Settlement.ClaimRadiusForLonghouseLevel(longhouseLevel));
            discs[settlement.Id] = [centreDisc];
            reached.Add(centreDisc);
            foreach (var building in settlement.Buildings)
            {
                if (building.Type == BuildingType.Tower && building.Level >= 1)
                {
                    pending.Add((settlement.Id, building.Coord, building.Level));
                }
            }
        }

        var connected = new HashSet<(Guid, HexCoord)>();
        var progressed = true;
        while (progressed)
        {
            progressed = false;
            for (var i = pending.Count - 1; i >= 0; i--)
            {
                var (id, coord, level) = pending[i];
                if (!reached.Any(d => d.Centre.DistanceTo(coord) <= d.Radius))
                {
                    continue;
                }

                var disc = (coord, Settlement.TowerClaimRadius(level));
                discs[id].Add(disc);
                reached.Add(disc);
                connected.Add((id, coord));
                pending.RemoveAt(i);
                progressed = true;
            }
        }

        return new ConnectedRealm(discs, connected);
    }

    /// <summary>
    /// Resolves many players' islands at once: <paramref name="settlements"/> are grouped by <c>Key</c> (the caller's
    /// player-and-island key) and every settlement maps to the realm of its own group.
    /// </summary>
    public static IReadOnlyDictionary<Guid, ConnectedRealm> ResolveGroups<TKey>(
        IEnumerable<(TKey Key, RealmSettlement Settlement)> settlements)
        where TKey : notnull
    {
        ArgumentNullException.ThrowIfNull(settlements);

        var result = new Dictionary<Guid, ConnectedRealm>();
        foreach (var group in settlements.GroupBy(s => s.Key))
        {
            var members = group.Select(s => s.Settlement).ToList();
            var realm = Resolve(members);
            foreach (var member in members)
            {
                result[member.Id] = realm;
            }
        }

        return result;
    }
}
