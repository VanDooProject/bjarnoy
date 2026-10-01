using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Palisades;

/// <summary>The six palisade pieces of the art contract (<c>3D_assets/docs/wall-tiles.md</c>); the wire/atlas family names are in <see cref="PalisadeRules.FamilyOf"/>.</summary>
public enum PalisadePiece
{
    /// <summary>Land, W - E.</summary>
    Straight180,

    /// <summary>Land, W - SW (adjacent edges, the tight turn).</summary>
    Bend60,

    /// <summary>Land, W - SE (one edge skipped, the wide turn).</summary>
    Bend120,

    /// <summary>Land, W - E: a straight with a gate in the middle.</summary>
    Gate180,

    /// <summary>Land, W only.</summary>
    End,

    /// <summary>Coastal water, W only (W is the land side).</summary>
    EndCoast,
}

/// <summary>Why a wall hex or a placement is refused. <see cref="Isolated"/> (no wall neighbour yet) is "not drawable yet", not an error.</summary>
public enum PalisadeRefusal
{
    Branch,
    GateNotStraight,
    NotAllowedOnTerrain,
    Isolated,
    Occupied,
}

/// <summary>A resolved piece: which piece, which of its six camera files, and the direction indices (<see cref="HexCoord.Neighbours"/> order) its wall runs into.</summary>
public sealed record PalisadeTile(PalisadePiece Piece, TileOrientation Dir, IReadOnlyList<int> Edges);

/// <summary>Either a <see cref="PalisadeTile"/> or a <see cref="PalisadeRefusal"/>.</summary>
public readonly record struct PalisadeResult(PalisadeTile? Tile, PalisadeRefusal? Refusal)
{
    public bool IsRefusal => Refusal is not null;

    public static PalisadeResult Of(PalisadeTile tile) => new(tile, null);

    public static PalisadeResult Refused(PalisadeRefusal refusal) => new(null, refusal);
}

/// <summary>The wall as placed: hex of every wall hex (a sea end included) and which of them are gates.</summary>
public sealed record WallSet(IReadOnlySet<HexCoord> Walls, IReadOnlySet<HexCoord> Gates)
{
    public static WallSet Empty { get; } = new(new HashSet<HexCoord>(), new HashSet<HexCoord>());
}

/// <summary>What a placement needs to know about the map.</summary>
public sealed record PalisadePlacementContext(
    Func<HexCoord, Terrain> TerrainAt,
    Func<HexCoord, bool> IsRiver,
    Func<HexCoord, bool>? IsPlainBog = null);

/// <summary>
/// Which palisade piece (and which of its six camera files) a wall hex renders with, and the placement rules that keep every wall
/// hex drawable: the C# twin of the frontend's <c>palisadeTiles.ts</c>, with a shared golden (<c>src/shared/palisade-golden.json</c>)
/// so the two cannot drift. The rotation convention is the one <c>palisadeTiles.ts</c> documents: file index D touches polygon edges
/// D+1 (canonical W), D (SW), D-1 (SE) and D+4 (E), and a direction index d borders polygon edge (3 - d) mod 6, so a piece whose W edge
/// faces direction dW is drawn from file <c>(2 - dW) mod 6</c>.
/// </summary>
/// <remarks>
/// Rules (<c>docs/design/economy.md</c> section 5): walls never branch (no hex has three or more wall neighbours), a gate exists only on
/// a straight, nothing is built on a river hex or on a mountain, lake or bog, and at the coast a wall ends in <see cref="PalisadePiece.EndCoast"/>
/// on a coastal water hex. A gate and a plain wall count the same as wall hexes for neighbour and branch purposes.
/// </remarks>
public static class PalisadeRules
{
    private static readonly TileOrientation[] TileOrientations =
        [TileOrientation.E, TileOrientation.NE, TileOrientation.NW, TileOrientation.W, TileOrientation.SW, TileOrientation.SE];

    /// <summary>Canonical edges as steps from W: W 0, SW 1, SE 2, E 3.</summary>
    private static int[] CanonicalSteps(PalisadePiece piece) => piece switch
    {
        PalisadePiece.Straight180 or PalisadePiece.Gate180 => [0, 3],
        PalisadePiece.Bend60 => [0, 1],
        PalisadePiece.Bend120 => [0, 2],
        _ => [0],
    };

    /// <summary>The atlas family name (the <c>&lt;family&gt;_&lt;DIR&gt;_levelNNN</c> frame prefix) of a piece.</summary>
    public static string FamilyOf(PalisadePiece piece) => piece switch
    {
        PalisadePiece.Straight180 => "palisade_straight180",
        PalisadePiece.Bend60 => "palisade_bend60",
        PalisadePiece.Bend120 => "palisade_bend120",
        PalisadePiece.Gate180 => "palisade_gate180",
        PalisadePiece.End => "palisade_end",
        PalisadePiece.EndCoast => "palisade_end_coast",
        _ => throw new ArgumentOutOfRangeException(nameof(piece), piece, "Unknown palisade piece"),
    };

    /// <summary>The camera file for a piece whose canonical W edge faces direction index <paramref name="dW"/>.</summary>
    public static TileOrientation DirForWestEdge(int dW) => TileOrientations[(((2 - dW) % 6) + 6) % 6];

    /// <summary>
    /// The piece for a wall hex, from which of its six neighbours (<see cref="HexCoord.Neighbours"/> order) are wall hexes.
    /// <paramref name="coastalWater"/> is a sea hex carrying the sea end; <paramref name="gate"/> a gate hex.
    /// </summary>
    public static PalisadeResult TileFor(IReadOnlyList<bool> wallNeighbours, bool coastalWater = false, bool gate = false)
    {
        ArgumentNullException.ThrowIfNull(wallNeighbours);
        var dirs = new List<int>();
        for (var d = 0; d < wallNeighbours.Count; d++)
        {
            if (wallNeighbours[d])
            {
                dirs.Add(d);
            }
        }

        var n = dirs.Count;

        if (coastalWater)
        {
            // A sea hex only ever carries the sea end, joined to exactly one land wall hex.
            if (gate)
            {
                return PalisadeResult.Refused(PalisadeRefusal.NotAllowedOnTerrain);
            }

            if (n == 0)
            {
                return PalisadeResult.Refused(PalisadeRefusal.Isolated);
            }

            return n > 1
                ? PalisadeResult.Refused(PalisadeRefusal.Branch)
                : PalisadeResult.Of(new PalisadeTile(PalisadePiece.EndCoast, DirForWestEdge(dirs[0]), [dirs[0]]));
        }

        if (n >= 3)
        {
            return PalisadeResult.Refused(PalisadeRefusal.Branch);
        }

        if (n == 0)
        {
            return PalisadeResult.Refused(gate ? PalisadeRefusal.GateNotStraight : PalisadeRefusal.Isolated);
        }

        if (n == 1)
        {
            return gate
                ? PalisadeResult.Refused(PalisadeRefusal.GateNotStraight)
                : PalisadeResult.Of(new PalisadeTile(PalisadePiece.End, DirForWestEdge(dirs[0]), [dirs[0]]));
        }

        int i = dirs[0], j = dirs[1];
        var diff = (j - i + 6) % 6;
        if (diff == 3)
        {
            return PalisadeResult.Of(new PalisadeTile(gate ? PalisadePiece.Gate180 : PalisadePiece.Straight180, DirForWestEdge(i), [i, j]));
        }

        if (gate)
        {
            return PalisadeResult.Refused(PalisadeRefusal.GateNotStraight);
        }

        // W-SW: W is the lower end of the adjacent pair; W-SE: W is the lower end of the pair two apart.
        return diff switch
        {
            1 => PalisadeResult.Of(new PalisadeTile(PalisadePiece.Bend60, DirForWestEdge(i), [i, j])),
            5 => PalisadeResult.Of(new PalisadeTile(PalisadePiece.Bend60, DirForWestEdge(j), [j, i])),
            2 => PalisadeResult.Of(new PalisadeTile(PalisadePiece.Bend120, DirForWestEdge(i), [i, j])),
            _ => PalisadeResult.Of(new PalisadeTile(PalisadePiece.Bend120, DirForWestEdge(j), [j, i])),
        };
    }

    private static bool[] WallNeighbourFlags(HexCoord c, IReadOnlySet<HexCoord> walls)
    {
        var flags = new bool[6];
        var neighbours = c.Neighbours();
        for (var d = 0; d < 6; d++)
        {
            flags[d] = walls.Contains(neighbours[d]);
        }

        return flags;
    }

    /// <summary>How many of <paramref name="c"/>'s six neighbours are wall hexes.</summary>
    public static int WallNeighbourCount(HexCoord c, IReadOnlySet<HexCoord> walls) =>
        c.Neighbours().Count(walls.Contains);

    /// <summary>The piece (or refusal) of one wall hex in a wall.</summary>
    public static PalisadeResult TileOfWallHex(HexCoord c, WallSet wall, Func<HexCoord, Terrain> terrainAt) =>
        TileFor(WallNeighbourFlags(c, wall.Walls), terrainAt(c) == Terrain.Sea, wall.Gates.Contains(c));

    /// <summary>
    /// Whether a wall (or gate) hex may be added at <paramref name="coord"/> to <paramref name="existing"/>. Adding a hex changes the
    /// pieces of its wall neighbours - an end becomes a straight, a straight that gains a third neighbour would branch, a gate that turns
    /// would no longer be a straight - so the new hex and every neighbour are re-resolved against the grown wall and any refusal there
    /// refuses the placement. A gate is placed on a hex that already has two opposite wall neighbours (or on an existing straight,
    /// which it replaces).
    /// </summary>
    public static PalisadeRefusal? CanPlace(
        HexCoord coord, WallSet existing, PalisadePlacementContext ctx, bool gate = false)
    {
        ArgumentNullException.ThrowIfNull(existing);
        ArgumentNullException.ThrowIfNull(ctx);

        var terrain = ctx.TerrainAt(coord);
        if (ctx.IsRiver(coord))
        {
            return PalisadeRefusal.NotAllowedOnTerrain;
        }

        var water = terrain == Terrain.Sea;
        // Plain bog moss takes a wall too; a bog shore, mouth, creek or lake does not.
        var plainBog = terrain == Terrain.Bog && ctx.IsPlainBog?.Invoke(coord) == true;
        if (!water && !plainBog && terrain is not (Terrain.Grass or Terrain.Sand or Terrain.Forest))
        {
            return PalisadeRefusal.NotAllowedOnTerrain;
        }

        if (water && gate)
        {
            return PalisadeRefusal.NotAllowedOnTerrain;
        }

        var isUpgrade = gate && existing.Walls.Contains(coord) && !existing.Gates.Contains(coord);
        if (existing.Walls.Contains(coord) && !isUpgrade)
        {
            return PalisadeRefusal.Occupied;
        }

        var walls = new HashSet<HexCoord>(existing.Walls) { coord };
        var gates = new HashSet<HexCoord>(existing.Gates);
        if (gate)
        {
            gates.Add(coord);
        }

        var grown = new WallSet(walls, gates);

        // The sea end hangs off exactly one land wall hex.
        if (water)
        {
            var wallNeighbours = coord.Neighbours().Where(existing.Walls.Contains).ToList();
            if (wallNeighbours.Count > 1)
            {
                return PalisadeRefusal.Branch;
            }

            if (wallNeighbours.Count == 0 || ctx.TerrainAt(wallNeighbours[0]) == Terrain.Sea)
            {
                return PalisadeRefusal.NotAllowedOnTerrain;
            }
        }

        var own = TileOfWallHex(coord, grown, ctx.TerrainAt);
        if (own.Refusal is { } ownRefusal && ownRefusal != PalisadeRefusal.Isolated)
        {
            return ownRefusal;
        }

        foreach (var n in coord.Neighbours())
        {
            if (!existing.Walls.Contains(n))
            {
                continue;
            }

            var result = TileOfWallHex(n, grown, ctx.TerrainAt);
            if (result.Refusal is not { } refusal)
            {
                continue;
            }

            // A gate still waiting for its second neighbour is unfinished, not wrong.
            if (refusal == PalisadeRefusal.GateNotStraight && WallNeighbourCount(n, walls) < 2)
            {
                continue;
            }

            if (refusal == PalisadeRefusal.Isolated)
            {
                continue;
            }

            return refusal;
        }

        return null;
    }

    /// <summary>
    /// Whether a land end (<see cref="PalisadePiece.End"/>) at <paramref name="c"/> is half open (any army may pass it, at a penalty)
    /// or sealed. An end that touches a mountain or a wide river is sealed: the wall runs up to a natural barrier and the barrier closes
    /// it. Anything else, the sea included, leaves it half open.
    /// </summary>
    public static bool IsSealedEnd(HexCoord c, Func<HexCoord, Terrain> terrainAt, Func<HexCoord, bool> isWideRiver)
    {
        foreach (var n in c.Neighbours())
        {
            if (terrainAt(n) == Terrain.Mountain || isWideRiver(n))
            {
                return true;
            }
        }

        return false;
    }
}

/// <summary>The wall hexes known around a placement: every wall hex (a gate included) in the world, which of them are gates, and the terrain lookup for their neighbours.</summary>
public sealed record PalisadeLayout(IReadOnlySet<HexCoord> Walls, IReadOnlySet<HexCoord> Gates, Func<HexCoord, Terrain> TerrainAt);
