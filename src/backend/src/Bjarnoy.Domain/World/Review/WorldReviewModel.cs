namespace Bjarnoy.Domain.World.Review;

/// <summary>How bad a <see cref="WorldReviewFinding"/> is. The numeric order is the sort order: errors first.</summary>
public enum WorldReviewSeverity
{
    /// <summary>Breaks a generator guarantee (should never happen) or makes a big island unplayable: switch seed.</summary>
    Error = 0,

    /// <summary>Hurts play on one island: worth a look before committing the seed.</summary>
    Warn = 1,

    /// <summary>Worth knowing, not a reason to switch seed on its own.</summary>
    Info = 2,
}

/// <summary>What a <see cref="WorldReviewFinding"/> is about. Wire names are the camelCase names.</summary>
public enum WorldReviewFindingKind
{
    /// <summary>
    /// Walkable land a land army cannot reach from its island's coast or landing spots once wide rivers and mountains are
    /// impassable (the rule set of PR #366's pathing preview).
    /// </summary>
    CutOffLand,

    /// <summary>An island of <see cref="WorldGenerationOptions.BogGuaranteeMinTiles"/>+ land tiles with a landing candidate but no bog.</summary>
    MissingBog,

    /// <summary>An island with a landing candidate (terrain only) but no landing spot after giants, camps and the bog-in-reach rule.</summary>
    NoLandingSpots,

    /// <summary>One of the bog map rules R1-R12 (<see cref="BogRules"/>) is broken on the island. Always 0 for a correct generator.</summary>
    BogRuleViolation,

    /// <summary>A river mouth with no sea beside it. Always 0 for a correct generator.</summary>
    InlandRiverMouth,

    /// <summary>A wasted island touching or close to a green one.</summary>
    WastedNearGreen,
}

/// <summary>
/// One thing the review found. <see cref="Hex"/> is a representative hex the admin map can centre on (a cut-off region's
/// middle, the first landing candidate, the mouth itself, ...); <see cref="Size"/> is the number of hexes involved where
/// that means something (a region's size, a violation count), else 0.
/// </summary>
public sealed record WorldReviewFinding(
    WorldReviewFindingKind Kind,
    WorldReviewSeverity Severity,
    int IslandIndex,
    HexCoord Hex,
    string Message,
    int Size = 0);

/// <summary>
/// The counts of a review. <see cref="CutOffTiles"/> counts every cut-off walkable hex, also those in regions below
/// <see cref="WorldReviewThresholds.CutOffMinRegionTiles"/>; <see cref="CutOffRegions"/> only the reported regions.
/// </summary>
public sealed record WorldReviewSummary(
    int Seed,
    int Radius,
    int GreenIslands,
    int WastedIslands,
    int LandTiles,
    int LandingSpots,
    int IslandsWithLandingCandidate,
    int IslandsWithoutLandingSpots,
    int IslandsMissingBog,
    int CutOffRegions,
    int CutOffTiles,
    double CutOffShare,
    double WorstIslandCutOffShare,
    int BogRuleViolations,
    int InlandRiverMouths,
    int WastedNearGreen,
    int Errors,
    int Warnings,
    int Infos)
{
    /// <summary>
    /// Best seed first: fewest errors, then fewest warnings, then least cut-off land, then most landing spots, then the
    /// lower seed (so the order is total and stable).
    /// </summary>
    public static Comparison<WorldReviewSummary> BestFirst { get; } = (a, b) =>
    {
        var c = a.Errors.CompareTo(b.Errors);
        if (c != 0)
        {
            return c;
        }

        c = a.Warnings.CompareTo(b.Warnings);
        if (c != 0)
        {
            return c;
        }

        c = a.CutOffTiles.CompareTo(b.CutOffTiles);
        if (c != 0)
        {
            return c;
        }

        c = b.LandingSpots.CompareTo(a.LandingSpots);
        return c != 0 ? c : a.Seed.CompareTo(b.Seed);
    };
}

/// <summary>The result of <see cref="WorldReview.Review"/>: the counts and every finding, errors first.</summary>
public sealed record WorldReviewResult(WorldReviewSummary Summary, IReadOnlyList<WorldReviewFinding> Findings);

/// <summary>Every threshold of the review in one place.</summary>
public static class WorldReviewThresholds
{
    /// <summary>A cut-off region smaller than this is counted in <see cref="WorldReviewSummary.CutOffTiles"/> but not reported.</summary>
    public const int CutOffMinRegionTiles = 6;

    /// <summary>A cut-off region of at least this many hexes is a warning rather than info.</summary>
    public const int CutOffWarnRegionTiles = 50;

    /// <summary>A cut-off region holding at least this share of its island's walkable land is a warning rather than info.</summary>
    public const double CutOffWarnIslandShare = 0.05;

    /// <summary>A cut-off region of at least this many hexes is an error: a whole playable valley nobody can walk into.</summary>
    public const int CutOffErrorRegionTiles = 500;

    /// <summary>
    /// An island this large with a landing candidate and no bog is an error rather than a warning: the bog guarantee's own
    /// test allows narrow islands below it to stay without (<c>BogGuaranteeTests</c>).
    /// </summary>
    public const int MissingBogErrorTiles = 500;

    /// <summary>A wasted island within this many hexes of a green one is reported (info).</summary>
    public const int WastedNearDistance = 4;

    /// <summary>A wasted island within this many hexes of a green one (1 = adjacent, 0 = overlapping) is a warning.</summary>
    public const int WastedTouchDistance = 1;
}
