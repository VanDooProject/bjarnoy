using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>One standing wall hex of the world: where, whether it is a gate, and whose (an opaque key two armies of one owner share: the account, or the settlement itself for an anonymous one).</summary>
public readonly record struct StandingWall(HexCoord Coord, bool IsGate, Guid OwnerKey);

/// <summary>
/// What a land army's pathfinding takes from the world's palisades (<see cref="HexPathfinder.FindPath"/>'s <c>blocked</c>,
/// <c>friendlyGate</c> and <c>halfOpen</c>), bound to one army's owner.
/// </summary>
public sealed record WallRules(
    Func<HexCoord, bool> Blocked,
    Func<HexCoord, bool> FriendlyGate,
    Func<HexCoord, bool> HalfOpen);

/// <summary>
/// A world's standing palisade hexes as the movement rules need them: built once per request from the persisted buildings (like
/// <see cref="RiverIndex"/>), only hexes of level 1 or more count (a foundation does not block).
/// </summary>
/// <remarks>
/// Every wall hex blocks land armies, the owner's included, with two exceptions (<c>docs/design/economy.md</c> section 5): a gate is
/// passable for its owner's armies only, and a land end (a plain palisade hex with exactly one wall neighbour) is half open, passable for
/// every army at <see cref="HexPathfinder.HalfOpenEndCost"/>, unless it touches a mountain or a wide river (a sealed end, which
/// blocks like any wall hex). The sea end stands on a sea hex a land army never enters anyway. Fleets are unaffected.
/// </remarks>
public sealed class PalisadeIndex
{
    private readonly Dictionary<HexCoord, StandingWall> _walls = [];
    private readonly HashSet<HexCoord> _wallHexes = [];
    private readonly Dictionary<HexCoord, bool> _halfOpen = [];
    private readonly Func<HexCoord, Terrain> _terrainAt;
    private readonly Func<HexCoord, bool> _isWideRiver;

    public PalisadeIndex(IEnumerable<StandingWall> walls, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver)
    {
        ArgumentNullException.ThrowIfNull(walls);
        _terrainAt = terrainAt ?? throw new ArgumentNullException(nameof(terrainAt));
        _isWideRiver = isWideRiver ?? throw new ArgumentNullException(nameof(isWideRiver));
        foreach (var wall in walls)
        {
            _walls[wall.Coord] = wall;
            _wallHexes.Add(wall.Coord);
        }
    }

    /// <summary>True when no wall stands anywhere in the world.</summary>
    public bool IsEmpty => _walls.Count == 0;

    /// <summary>True when a standing wall hex (gate or plain) is on <paramref name="hex"/>.</summary>
    public bool IsWall(HexCoord hex) => _wallHexes.Contains(hex);

    /// <summary>True when a plain palisade hex on <paramref name="hex"/> is a half-open land end.</summary>
    public bool IsHalfOpen(HexCoord hex)
    {
        if (!_walls.TryGetValue(hex, out var wall) || wall.IsGate)
        {
            return false;
        }

        if (_halfOpen.TryGetValue(hex, out var cached))
        {
            return cached;
        }

        // A sea end stands on water and is never a land end; a land end has exactly one wall neighbour.
        var halfOpen = _terrainAt(hex) != Terrain.Sea
            && PalisadeRules.WallNeighbourCount(hex, _wallHexes) == 1
            && !PalisadeRules.IsSealedEnd(hex, _terrainAt, _isWideRiver);
        _halfOpen[hex] = halfOpen;
        return halfOpen;
    }

    /// <summary>The wall rules for an army of <paramref name="ownerKey"/> , or <see langword="null"/> when there is no wall to take into account.</summary>
    public WallRules? ForOwner(Guid ownerKey) => IsEmpty
        ? null
        : new WallRules(
            IsWall,
            hex => _walls.TryGetValue(hex, out var wall) && wall.IsGate && wall.OwnerKey == ownerKey,
            IsHalfOpen);
}
