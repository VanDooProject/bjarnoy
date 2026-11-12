using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Movement;

/// <summary>
/// A world's wall hexes over time (<see cref="TimedWall"/>), keyed by hex: what an army already marching needs to tell when a wall began to
/// block it (<c>docs/design/troop-movement-range.md</c> §5, "Walls built after an army set out block it too"). Pure.
/// </summary>
public sealed class WallTimeline
{
    private readonly Dictionary<HexCoord, TimedWall> _walls = [];

    public WallTimeline(IEnumerable<TimedWall> walls)
    {
        ArgumentNullException.ThrowIfNull(walls);
        foreach (var wall in walls)
        {
            _walls[wall.Wall.Coord] = wall;
        }
    }

    /// <summary>Every wall hex of the timeline.</summary>
    public IEnumerable<TimedWall> Walls => _walls.Values;

    /// <summary>True when the world has no wall at all.</summary>
    public bool IsEmpty => _walls.Count == 0;

    /// <summary>The wall on <paramref name="hex"/>, if there is one at any time.</summary>
    public bool TryGet(HexCoord hex, out TimedWall wall) => _walls.TryGetValue(hex, out wall);

    /// <summary>The walls standing at <paramref name="at"/>.</summary>
    public IEnumerable<StandingWall> StandingAt(DateTimeOffset at) => _walls.Values.Where(w => w.StandsAt(at)).Select(w => w.Wall);

    /// <summary>
    /// The instants at which whether <paramref name="hex"/> blocks can change by the timeline: its own wall going up or down, and its
    /// neighbours' (a plain piece is a half-open land end only while exactly one neighbour stands).
    /// </summary>
    public IEnumerable<DateTimeOffset> EventsAround(HexCoord hex)
    {
        foreach (var coord in hex.Neighbours().Prepend(hex))
        {
            if (_walls.TryGetValue(coord, out var wall))
            {
                yield return wall.StandingFrom;
                if (wall.StandingUntil is { } until)
                {
                    yield return until;
                }
            }
        }
    }

    /// <summary>
    /// The cheap pre-check before any route rule is built (it needs no terrain, river or guild read): whether the wall on
    /// <paramref name="hex"/> may block an army of <paramref name="ownerKey"/> whose route was planned at <paramref name="plannedAt"/>, by
    /// <paramref name="now"/>.
    /// </summary>
    /// <remarks>
    /// <list type="bullet">
    /// <item>No wall, or a gate of the army's own owner (open to it inside its realm and outside): never.</item>
    /// <item>Another owner's gate: it may have closed since without a timestamp (a friendship or peace ended, the gate rejoined its realm).</item>
    /// <item>A plain piece that stood when the route was planned as no land end (not exactly one standing neighbour): it blocked then
    /// already, so the route was planned before the timeline knew of it (a waiting order's instants are set in the past).</item>
    /// <item>Any other plain piece only when the timeline changed around it after the route was planned (<see cref="EventsAround"/> in
    /// <c>(plannedAt, now]</c>): a route is planned with the walls standing then, and every settle up to <paramref name="now"/> has dealt
    /// with what changed before it, so a piece whose neighbourhood stayed the same blocks no route that goes through it.</item>
    /// </list>
    /// </remarks>
    public bool MayBlock(HexCoord hex, Guid ownerKey, DateTimeOffset plannedAt, DateTimeOffset now)
    {
        if (!_walls.TryGetValue(hex, out var wall))
        {
            return false;
        }

        if (wall.Wall.IsGate)
        {
            return wall.Wall.OwnerKey != ownerKey;
        }

        // A piece standing when the route was planned that was no land end then (not exactly one neighbour) blocked even then: the
        // route cannot have been planned through it, it only learnt of it later (a waiting order that started when the one ahead of it
        // finished gets its instants, in the past, when its owner settles).
        if (wall.StandsAt(plannedAt) && hex.Neighbours().Count(n => _walls.TryGetValue(n, out var nb) && nb.StandsAt(plannedAt)) != 1)
        {
            return true;
        }

        return EventsAround(hex).Any(e => e > plannedAt && e <= now);
    }
}

/// <summary>
/// The route rules of a <see cref="WallTimeline"/> at any instant, the one rule set both the detection of a wall in an army's way
/// (<see cref="FirstBlockingIn"/>) and the re-route around it (<see cref="IndexAt"/>) use. Terrain, wide rivers and friendships are those of
/// now (they carry no history). Pure; the indexes are cached per instant.
/// </summary>
public sealed class WallBlocking(
    WallTimeline timeline, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver, Func<Guid, Guid, bool>? areFriends = null)
{
    private readonly Dictionary<DateTimeOffset, PalisadeIndex> _indexAt = [];

    /// <summary>The walls standing at <paramref name="at"/> as a <see cref="PalisadeIndex"/>.</summary>
    public PalisadeIndex IndexAt(DateTimeOffset at)
    {
        if (!_indexAt.TryGetValue(at, out var index))
        {
            index = new PalisadeIndex(timeline.StandingAt(at), terrainAt, isWideRiver, areFriends);
            _indexAt[at] = index;
        }

        return index;
    }

    /// <summary>
    /// The first instant in <c>[<paramref name="from"/>, <paramref name="before"/>)</c> at which <paramref name="hex"/> blocks an army of
    /// <paramref name="ownerKey"/> whose route was planned at <paramref name="plannedAt"/>, or <see langword="null"/> when it does not then.
    /// </summary>
    /// <remarks>
    /// <list type="bullet">
    /// <item>A plain piece blocks while it stands and is not a half-open land end. It blocks from the later of its own instant and the
    /// instant of the neighbour that turned it from an end into a blocking piece (<see cref="WallTimeline.EventsAround"/>).</item>
    /// <item>A gate blocks while it stands and does not open for the army (<see cref="WallRules.FriendlyGate"/>, with today's friendships
    /// and realms). Those changes carry no instant: a gate that already stood when the route was planned (and so was open then) blocks
    /// from <paramref name="untimedFrom"/> on, never earlier (the instant the army is settled to); a gate built after it blocks from its
    /// own instant.</item>
    /// </list>
    /// </remarks>
    public DateTimeOffset? FirstBlockingIn(
        HexCoord hex, Guid ownerKey, DateTimeOffset from, DateTimeOffset before, DateTimeOffset plannedAt, DateTimeOffset untimedFrom)
    {
        if (from >= before || !timeline.TryGet(hex, out var wall))
        {
            return null;
        }

        var candidates = timeline.EventsAround(hex).Append(untimedFrom)
            .Where(t => t > from && t < before)
            .Prepend(from)
            .Distinct()
            .Order();
        foreach (var t in candidates)
        {
            if (BlocksAt(hex, wall, ownerKey, t, plannedAt, untimedFrom))
            {
                return t;
            }
        }

        return null;
    }

    private bool BlocksAt(HexCoord hex, TimedWall wall, Guid ownerKey, DateTimeOffset at, DateTimeOffset plannedAt, DateTimeOffset untimedFrom)
    {
        var index = IndexAt(at);
        if (!index.IsWall(hex))
        {
            return false;
        }

        if (wall.Wall.IsGate)
        {
            return !index.ForOwner(ownerKey)!.FriendlyGate(hex) && (at >= untimedFrom || wall.StandingFrom > plannedAt);
        }

        return !index.IsHalfOpen(hex);
    }
}
