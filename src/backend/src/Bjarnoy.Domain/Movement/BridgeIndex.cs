using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>One standing bridge of the world: where, how far built (1 to 4) and whose (the opaque owner key two armies of one owner share, as in <see cref="StandingWall"/>).</summary>
public readonly record struct StandingBridge(HexCoord Coord, int Level, Guid OwnerKey);

/// <summary>
/// A world's standing bridges as the movement rules need them: built once per request from the persisted buildings, only bridges of level 1
/// or more count (a foundation does not open the river).
/// </summary>
/// <remarks>
/// A wide river is impassable to land armies; a bridge on it opens it (<c>docs/design/economy.md</c> section 5). By level: 1 (causeway) costs
/// <c>1.0 + <see cref="HexPathfinder.CausewayCrossingCost"/></c>, 2 (footbridge) <c>1.0 + <see cref="HexPathfinder.FootbridgeCrossingCost"/></c>,
/// 3 (king's bridge) the land terrain's own cost, all for every army, the owner's included; 4 (guarded bridge) the terrain's cost for the
/// owner's armies and their friends (the same guild, or guilds at peace, like a palisade gate) and impassable for everyone else. Fleets are unaffected.
/// </remarks>
public sealed class BridgeIndex
{
    /// <summary>The highest bridge level, the guarded one that only the owner and their friends cross.</summary>
    public const int GuardedLevel = 4;

    private readonly Dictionary<HexCoord, StandingBridge> _bridges = [];
    private readonly Func<HexCoord, Terrain> _terrainAt;
    private readonly Func<Guid, Guid, bool> _areFriends;

    /// <param name="areFriends">Whether two owner keys are friends (same guild, or guilds at peace); a key is always its own friend. Default: nobody is.</param>
    public BridgeIndex(IEnumerable<StandingBridge> bridges, Func<HexCoord, Terrain> terrainAt, Func<Guid, Guid, bool>? areFriends = null)
    {
        ArgumentNullException.ThrowIfNull(bridges);
        _terrainAt = terrainAt ?? throw new ArgumentNullException(nameof(terrainAt));
        _areFriends = areFriends ?? ((_, _) => false);
        foreach (var bridge in bridges.Where(b => b.Level >= 1))
        {
            _bridges[bridge.Coord] = bridge;
        }
    }

    /// <summary>True when no bridge stands anywhere in the world.</summary>
    public bool IsEmpty => _bridges.Count == 0;

    /// <summary>The standing bridge on <paramref name="hex"/>, if any.</summary>
    public StandingBridge? BridgeAt(HexCoord hex) => _bridges.TryGetValue(hex, out var bridge) ? bridge : null;

    /// <summary>
    /// What an army of <paramref name="ownerKey"/> pays to enter the (wide river) hex <paramref name="hex"/> over its bridge, or
    /// <see langword="null"/> when there is no bridge there or it is a guarded one the army may not cross.
    /// </summary>
    public double? CrossingCost(HexCoord hex, Guid ownerKey)
    {
        if (!_bridges.TryGetValue(hex, out var bridge))
        {
            return null;
        }

        return bridge.Level switch
        {
            1 => 1.0 + HexPathfinder.CausewayCrossingCost,
            2 => 1.0 + HexPathfinder.FootbridgeCrossingCost,
            3 => HexPathfinder.LandTerrainCostOf(_terrainAt(hex)),
            _ => bridge.OwnerKey == ownerKey || _areFriends(bridge.OwnerKey, ownerKey)
                ? HexPathfinder.LandTerrainCostOf(_terrainAt(hex))
                : null,
        };
    }

    /// <summary>The bridge lookup for an army of <paramref name="ownerKey"/> (<see cref="HexPathfinder.FindPath"/>'s <c>bridgeCost</c>), or <see langword="null"/> when no bridge stands.</summary>
    public Func<HexCoord, double?>? ForOwner(Guid ownerKey) => IsEmpty ? null : hex => CrossingCost(hex, ownerKey);
}

/// <summary>
/// The per-owner route rules of a world's palisades and bridges together: what every call site that builds a land route asks for once
/// per request and binds to the army's owner.
/// </summary>
public sealed class LandRouteIndex(PalisadeIndex walls, BridgeIndex bridges)
{
    /// <summary>The route rules for an army of <paramref name="ownerKey"/>, or <see langword="null"/> when neither a wall nor a bridge stands.</summary>
    public WallRules? ForOwner(Guid ownerKey)
    {
        var wallRules = walls.ForOwner(ownerKey);
        var bridgeCost = bridges.ForOwner(ownerKey);
        if (bridgeCost is null)
        {
            return wallRules;
        }

        return (wallRules ?? new WallRules(_ => false, _ => false, _ => false)) with { BridgeCost = bridgeCost };
    }
}
