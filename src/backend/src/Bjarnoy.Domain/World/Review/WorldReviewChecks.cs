using System.Globalization;

namespace Bjarnoy.Domain.World.Review;

/// <summary>
/// One independent review check. A check reads the shared <see cref="WorldReviewContext"/> and appends its findings; it never
/// depends on another check having run. Add a new one to <see cref="WorldReview.DefaultChecks"/>.
/// </summary>
public interface IWorldReviewCheck
{
    void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken);
}

/// <summary>
/// Missing bog: a green island of at least <see cref="WorldGenerationOptions.BogGuaranteeMinTiles"/> land tiles with a landing
/// candidate (<see cref="ReviewedIsland.LandingCandidates"/>) but no bog at all - what the bog guarantee is meant to prevent.
/// Off when the guarantee is (<c>BogGuaranteeMinTiles</c> 0, the compact preset).
/// </summary>
public sealed class MissingBogCheck : IWorldReviewCheck
{
    public void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(findings);

        var minTiles = context.Options.BogGuaranteeMinTiles;
        if (minTiles <= 0)
        {
            return;
        }

        foreach (var island in context.GreenIslands)
        {
            if (island.Island.TileCount < minTiles || island.LandingCandidates.Count == 0 || island.Island.BogTiles.Count > 0)
            {
                continue;
            }

            findings.Add(new WorldReviewFinding(
                WorldReviewFindingKind.MissingBog,
                island.Island.TileCount >= WorldReviewThresholds.MissingBogErrorTiles ? WorldReviewSeverity.Error : WorldReviewSeverity.Warn,
                island.Index,
                island.LandingCandidates[0],
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"{island.Island.TileCount} land tiles and {island.LandingCandidates.Count} landing candidates, but no bog"),
                island.Island.TileCount));
        }
    }
}

/// <summary>
/// No landing spots: a green island with a landing candidate by terrain but no landing spot once giants, strong camps and the
/// bog-in-reach rule have had their say. The island is still there; nobody can start on it.
/// </summary>
public sealed class NoLandingSpotsCheck : IWorldReviewCheck
{
    public void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(findings);

        foreach (var island in context.GreenIslands)
        {
            if (island.LandingCandidates.Count == 0 || island.Island.StartPositions.Count > 0)
            {
                continue;
            }

            var why = island.Island.BogTiles.Count == 0
                ? "no bog"
                : "no plain bog in reach, or giants and strong camps too close";
            findings.Add(new WorldReviewFinding(
                WorldReviewFindingKind.NoLandingSpots,
                WorldReviewSeverity.Warn,
                island.Index,
                island.LandingCandidates[0],
                string.Create(
                    CultureInfo.InvariantCulture,
                    $"{island.LandingCandidates.Count} landing candidates by terrain, no landing spot ({why})"),
                island.LandingCandidates.Count));
        }
    }
}

/// <summary>Bog rule violations (R1-R12, <see cref="BogRules"/>) per green island: the generator guarantees 0, so any is an error.</summary>
public sealed class BogRuleCheck : IWorldReviewCheck
{
    public void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(findings);

        foreach (var island in context.GreenIslands)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (island.Island.BogTiles.Count == 0)
            {
                continue;
            }

            var violations = BogRules.Check(island.Island.BogTiles, island.Island.RiverTiles, context.Sampler.TerrainAt);
            if (violations.Total == 0)
            {
                continue;
            }

            findings.Add(new WorldReviewFinding(
                WorldReviewFindingKind.BogRuleViolation,
                WorldReviewSeverity.Error,
                island.Index,
                ReviewedIsland.Middle([.. island.Island.BogTiles.Select(t => t.Coord)]),
                $"bog rules broken: {violations}",
                violations.Total));
        }
    }
}

/// <summary>Inland river mouths: a green island's river mouth with no water of the sea beside it. The generator guarantees 0.</summary>
public sealed class InlandRiverMouthCheck : IWorldReviewCheck
{
    public void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(findings);

        foreach (var island in context.GreenIslands)
        {
            foreach (var tile in island.Island.RiverTiles)
            {
                if (tile.Shape != RiverTileShape.Mouth || tile.Coord.Neighbours().Any(n => !context.Sampler.IsLand(n)))
                {
                    continue;
                }

                findings.Add(new WorldReviewFinding(
                    WorldReviewFindingKind.InlandRiverMouth,
                    WorldReviewSeverity.Error,
                    island.Index,
                    tile.Coord,
                    "river mouth with no sea beside it",
                    1));
            }
        }
    }
}

/// <summary>
/// Wasted islands touching or near green ones: for every wasted island, the nearest green island within
/// <see cref="WorldReviewThresholds.WastedNearDistance"/> hexes. Bounding boxes pick the pairs; only the wasted island's coast
/// is searched, so the cost is its shoreline times a small disc.
/// </summary>
public sealed class WastedNearGreenCheck : IWorldReviewCheck
{
    public void Run(WorldReviewContext context, IList<WorldReviewFinding> findings, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(findings);

        var reach = WorldReviewThresholds.WastedNearDistance;
        var green = context.World.Islands.Where(i => !i.IsWasted).Select(i => (Island: i, Box: Box.Of(i.Tiles))).ToList();
        var greenSets = new Dictionary<int, HashSet<HexCoord>>();

        foreach (var wasted in context.World.Islands.Where(i => i.IsWasted))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var box = Box.Of(wasted.Tiles);
            var near = green.Where(g => g.Box.Overlaps(box, reach)).Select(g => g.Island).ToList();
            if (near.Count == 0)
            {
                continue;
            }

            var own = wasted.Tiles.ToHashSet();
            var best = (Distance: int.MaxValue, Green: -1, Hex: default(HexCoord));
            foreach (var g in near)
            {
                if (!greenSets.TryGetValue(g.Index, out var set))
                {
                    set = [.. g.Tiles];
                    greenSets[g.Index] = set;
                }

                foreach (var tile in wasted.Tiles)
                {
                    // Only the coast can be the nearest point (or, overlapping, any tile: a shared hex is checked directly).
                    if (set.Contains(tile))
                    {
                        best = Better(best, (0, g.Index, tile));
                        continue;
                    }

                    if (tile.Neighbours().All(own.Contains))
                    {
                        continue;
                    }

                    foreach (var nearby in tile.WithinRadius(reach))
                    {
                        if (set.Contains(nearby))
                        {
                            best = Better(best, (HexCoord.Distance(tile, nearby), g.Index, tile));
                        }
                    }
                }
            }

            if (best.Green < 0)
            {
                continue;
            }

            findings.Add(new WorldReviewFinding(
                WorldReviewFindingKind.WastedNearGreen,
                best.Distance <= WorldReviewThresholds.WastedTouchDistance ? WorldReviewSeverity.Warn : WorldReviewSeverity.Info,
                wasted.Index,
                best.Hex,
                best.Distance == 0
                    ? string.Create(CultureInfo.InvariantCulture, $"wasted island overlaps green island {best.Green}")
                    : string.Create(CultureInfo.InvariantCulture, $"wasted island {best.Distance} hexes from green island {best.Green}"),
                best.Distance));
        }
    }

    private static (int Distance, int Green, HexCoord Hex) Better(
        (int Distance, int Green, HexCoord Hex) a, (int Distance, int Green, HexCoord Hex) b)
    {
        if (b.Distance != a.Distance)
        {
            return b.Distance < a.Distance ? b : a;
        }

        if (b.Green != a.Green)
        {
            return b.Green < a.Green ? b : a;
        }

        return b.Hex.Q < a.Hex.Q || (b.Hex.Q == a.Hex.Q && b.Hex.R < a.Hex.R) ? b : a;
    }

    private readonly record struct Box(int MinQ, int MaxQ, int MinR, int MaxR, int MinS, int MaxS)
    {
        public static Box Of(IReadOnlyList<HexCoord> tiles)
        {
            int minQ = int.MaxValue, maxQ = int.MinValue, minR = int.MaxValue, maxR = int.MinValue, minS = int.MaxValue, maxS = int.MinValue;
            foreach (var t in tiles)
            {
                minQ = Math.Min(minQ, t.Q);
                maxQ = Math.Max(maxQ, t.Q);
                minR = Math.Min(minR, t.R);
                maxR = Math.Max(maxR, t.R);
                minS = Math.Min(minS, t.S);
                maxS = Math.Max(maxS, t.S);
            }

            return new Box(minQ, maxQ, minR, maxR, minS, maxS);
        }

        /// <summary>Whether two hexes, one in each box, could be within <paramref name="reach"/> steps (all three cube axes).</summary>
        public bool Overlaps(Box o, int reach) =>
            MinQ - reach <= o.MaxQ && o.MinQ - reach <= MaxQ
            && MinR - reach <= o.MaxR && o.MinR - reach <= MaxR
            && MinS - reach <= o.MaxS && o.MinS - reach <= MaxS;
    }
}
