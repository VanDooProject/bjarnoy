namespace Bjarnoy.Domain.World.Review;

/// <summary>
/// Reviews a generated world for the things that make a seed worth switching: land nobody can walk to, islands without the
/// bog their landing spots need, islands with no landing spot, and any broken generator guarantee (bog rules, inland river
/// mouths). Pure and server-side only; see <c>docs/design/world-generation-rules.md</c>, "World review".
/// </summary>
public static class WorldReview
{
    /// <summary>Every check, in the order they run. Each is independent; add new ones here.</summary>
    public static IReadOnlyList<IWorldReviewCheck> DefaultChecks { get; } =
    [
        new CutOffLandCheck(),
        new MissingBogCheck(),
        new NoLandingSpotsCheck(),
        new BogRuleCheck(),
        new InlandRiverMouthCheck(),
        new WastedNearGreenCheck(),
    ];

    public static WorldReviewResult Review(GeneratedWorld world, CancellationToken cancellationToken = default) =>
        Review(world, DefaultChecks, cancellationToken);

    public static WorldReviewResult Review(
        GeneratedWorld world, IReadOnlyList<IWorldReviewCheck> checks, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(world);
        ArgumentNullException.ThrowIfNull(checks);

        var context = new WorldReviewContext(world, cancellationToken);
        var findings = new List<WorldReviewFinding>();
        foreach (var check in checks)
        {
            cancellationToken.ThrowIfCancellationRequested();
            check.Run(context, findings, cancellationToken);
        }

        findings.Sort(static (a, b) =>
        {
            var c = a.Severity.CompareTo(b.Severity);
            if (c != 0)
            {
                return c;
            }

            c = a.Kind.CompareTo(b.Kind);
            if (c != 0)
            {
                return c;
            }

            c = b.Size.CompareTo(a.Size);
            if (c != 0)
            {
                return c;
            }

            c = a.IslandIndex.CompareTo(b.IslandIndex);
            if (c != 0)
            {
                return c;
            }

            return a.Hex.Q != b.Hex.Q ? a.Hex.Q.CompareTo(b.Hex.Q) : a.Hex.R.CompareTo(b.Hex.R);
        });

        return new WorldReviewResult(Summarise(context, findings), findings);
    }

    private static WorldReviewSummary Summarise(WorldReviewContext context, List<WorldReviewFinding> findings)
    {
        int Count(WorldReviewFindingKind kind) => findings.Count(f => f.Kind == kind);
        int Sum(WorldReviewFindingKind kind) => findings.Where(f => f.Kind == kind).Sum(f => f.Size);

        var walkable = context.WalkableTiles;
        return new WorldReviewSummary(
            Seed: context.Options.Seed,
            Radius: context.Options.Radius,
            GreenIslands: context.GreenIslands.Count,
            WastedIslands: context.World.Islands.Count(i => i.IsWasted),
            LandTiles: context.World.LandTileCount,
            LandingSpots: context.GreenIslands.Sum(i => i.Island.StartPositions.Count),
            IslandsWithLandingCandidate: context.GreenIslands.Count(i => i.LandingCandidates.Count > 0),
            IslandsWithoutLandingSpots: Count(WorldReviewFindingKind.NoLandingSpots),
            IslandsMissingBog: Count(WorldReviewFindingKind.MissingBog),
            CutOffRegions: Count(WorldReviewFindingKind.CutOffLand),
            CutOffTiles: (int)context.CutOffTiles,
            CutOffShare: walkable == 0 ? 0.0 : (double)context.CutOffTiles / walkable,
            WorstIslandCutOffShare: context.WorstIslandCutOffShare,
            BogRuleViolations: Sum(WorldReviewFindingKind.BogRuleViolation),
            InlandRiverMouths: Count(WorldReviewFindingKind.InlandRiverMouth),
            WastedNearGreen: Count(WorldReviewFindingKind.WastedNearGreen),
            Errors: findings.Count(f => f.Severity == WorldReviewSeverity.Error),
            Warnings: findings.Count(f => f.Severity == WorldReviewSeverity.Warn),
            Infos: findings.Count(f => f.Severity == WorldReviewSeverity.Info));
    }
}
