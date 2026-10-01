using Bjarnoy.Domain.World.Review;

namespace Bjarnoy.Api.Contracts;

/// <summary>
/// The counts of a world review (<see cref="WorldReview"/>), see <see cref="WorldReviewSummary"/>. <see cref="CutOffShare"/>
/// and <see cref="WorstIslandCutOffShare"/> are fractions (0.02 = 2%).
/// </summary>
public sealed record WorldReviewSummaryResponse(
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
    public static WorldReviewSummaryResponse From(WorldReviewSummary s)
    {
        ArgumentNullException.ThrowIfNull(s);
        return new WorldReviewSummaryResponse(
            s.Seed,
            s.Radius,
            s.GreenIslands,
            s.WastedIslands,
            s.LandTiles,
            s.LandingSpots,
            s.IslandsWithLandingCandidate,
            s.IslandsWithoutLandingSpots,
            s.IslandsMissingBog,
            s.CutOffRegions,
            s.CutOffTiles,
            s.CutOffShare,
            s.WorstIslandCutOffShare,
            s.BogRuleViolations,
            s.InlandRiverMouths,
            s.WastedNearGreen,
            s.Errors,
            s.Warnings,
            s.Infos);
    }
}

/// <summary>One finding of a world review.</summary>
/// <param name="Kind">cutOffLand, missingBog, noLandingSpots, bogRuleViolation, inlandRiverMouth or wastedNearGreen.</param>
/// <param name="Severity">error, warn or info.</param>
/// <param name="Island">The island's index in the preview (<see cref="PreviewIslandResponse.Index"/>).</param>
/// <param name="Q">A representative hex the map can centre on.</param>
/// <param name="R">A representative hex the map can centre on.</param>
/// <param name="Size">Hexes involved (a cut-off region's size, a violation count, a distance), or 0.</param>
public sealed record WorldReviewFindingResponse(
    string Kind,
    string Severity,
    int Island,
    int Q,
    int R,
    int Size,
    string Message)
{
    private static readonly string[] KindNames =
        ["cutOffLand", "missingBog", "noLandingSpots", "bogRuleViolation", "inlandRiverMouth", "wastedNearGreen"];

    private static readonly string[] SeverityNames = ["error", "warn", "info"];

    public static WorldReviewFindingResponse From(WorldReviewFinding f)
    {
        ArgumentNullException.ThrowIfNull(f);
        return new WorldReviewFindingResponse(
            KindNames[(int)f.Kind], SeverityNames[(int)f.Severity], f.IslandIndex, f.Hex.Q, f.Hex.R, f.Size, f.Message);
    }
}

/// <summary>A world review: the counts and every finding, worst first.</summary>
public sealed record WorldReviewResponse(
    WorldReviewSummaryResponse Summary,
    IReadOnlyList<WorldReviewFindingResponse> Findings)
{
    public static WorldReviewResponse From(WorldReviewResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        return new WorldReviewResponse(
            WorldReviewSummaryResponse.From(result.Summary),
            [.. result.Findings.Select(WorldReviewFindingResponse.From)]);
    }
}

/// <summary>
/// Reviews <see cref="Count"/> consecutive candidate seeds from <see cref="SeedFrom"/> (at most
/// <see cref="MaxCount"/>), with the same radius/generation semantics as <see cref="PreviewWorldSeedRequest"/>.
/// </summary>
public sealed record ReviewWorldSeedsRequest(
    int SeedFrom,
    int Count = 4,
    int? Radius = null,
    WorldGenerationSettingsOverrides? Generation = null)
{
    /// <summary>
    /// Most seeds one request reviews. A radius-4000 world takes 20-35 s to generate, and the seeds share the machine's cores,
    /// so 8 is already a minute or more in one request.
    /// </summary>
    public const int MaxCount = 8;
}

/// <summary>The candidate seeds' review summaries, best first (see <see cref="WorldReviewSummary.BestFirst"/>). Persists nothing.</summary>
public sealed record WorldSeedReviewResponse(
    Guid WorldId,
    int Radius,
    IReadOnlyList<WorldReviewSummaryResponse> Seeds,
    WorldGenerationResponse Generation);
