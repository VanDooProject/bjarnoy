// World review CLI: generates the world of each seed and prints Bjarnoy.Domain's WorldReview of it, so a developer or an
// agent can re-pin seeds or check what a generator change did without the admin UI.
//
//   cd src/backend
//   dotnet run -c Release --project tools/Bjarnoy.WorldReviewCli -- --seeds 1-8 --radius 1000
//   dotnet run -c Release --project tools/Bjarnoy.WorldReviewCli -- --seeds 1-4 --radius 4000 --findings 20
//   dotnet run -c Release --project tools/Bjarnoy.WorldReviewCli -- --seeds 7 --compact --radius 300 --json
//
// See docs/design/world-generation-rules.md, "World review".
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using Bjarnoy.Domain.World;
using Bjarnoy.Domain.World.Review;

const string Usage = """
    world review: generates each seed's world and prints its review

      --seeds LIST     seeds, e.g. 1-8 or 3,7,11-12 (default 1-4)
      --radius N       world radius (default 4000, the production size)
      --compact        use the scaled-down WorldGenerationOptions.Compact preset
      --findings N     findings printed per seed, worst first (default 10; 0 for none, -1 for all)
      --json           print one JSON object per seed (summary and findings) instead of text
    """;

var argv = args.ToList();
if (argv.Contains("--help") || argv.Contains("-h"))
{
    Console.WriteLine(Usage);
    return 0;
}

string? Opt(string name)
{
    var i = argv.IndexOf(name);
    return i >= 0 && i + 1 < argv.Count ? argv[i + 1] : null;
}

List<int> seeds;
int radius;
int findingsShown;
try
{
    seeds = ParseSeeds(Opt("--seeds") ?? "1-4");
    radius = int.Parse(Opt("--radius") ?? "4000", CultureInfo.InvariantCulture);
    findingsShown = int.Parse(Opt("--findings") ?? "10", CultureInfo.InvariantCulture);
}
catch (FormatException ex)
{
    Console.Error.WriteLine(ex.Message);
    Console.Error.WriteLine(Usage);
    return 2;
}

var compact = argv.Contains("--compact");
var json = argv.Contains("--json");
var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
};

var summaries = new List<WorldReviewSummary>();
var kindTotals = new SortedDictionary<WorldReviewFindingKind, (int Error, int Warn, int Info)>();
foreach (var seed in seeds)
{
    var options = compact ? WorldGenerationOptions.Compact(seed, radius) : WorldGenerationOptions.ForSeed(seed) with { Radius = radius };
    var clock = Stopwatch.StartNew();
    var world = new WorldGenerator(options).Generate();
    var generated = clock.Elapsed;
    var review = WorldReview.Review(world);
    var reviewed = clock.Elapsed - generated;
    summaries.Add(review.Summary);

    foreach (var f in review.Findings)
    {
        var t = kindTotals.GetValueOrDefault(f.Kind);
        kindTotals[f.Kind] = f.Severity switch
        {
            WorldReviewSeverity.Error => t with { Error = t.Error + 1 },
            WorldReviewSeverity.Warn => t with { Warn = t.Warn + 1 },
            _ => t with { Info = t.Info + 1 },
        };
    }

    if (json)
    {
        Console.WriteLine(JsonSerializer.Serialize(
            new { review.Summary, Findings = review.Findings.Select(f => new { f.Kind, f.Severity, Island = f.IslandIndex, f.Hex.Q, f.Hex.R, f.Size, f.Message }) },
            jsonOptions));
        continue;
    }

    var s = review.Summary;
    Console.WriteLine(Invariant(
        $"seed {seed} radius {radius}: generated in {generated.TotalSeconds:F1} s, reviewed in {reviewed.TotalSeconds:F1} s"));
    Console.WriteLine(Invariant(
        $"  {s.GreenIslands} green + {s.WastedIslands} wasted islands, {s.LandTiles} land, {s.LandingSpots} landing spots, ") +
        Invariant($"{s.IslandsWithLandingCandidate} islands with a landing candidate"));
    Console.WriteLine(Invariant(
        $"  errors {s.Errors}, warnings {s.Warnings}, info {s.Infos} | cut-off regions {s.CutOffRegions}, cut-off hexes {s.CutOffTiles} ") +
        Invariant($"({s.CutOffShare:P2} of walkable, worst island {s.WorstIslandCutOffShare:P1}) | missing bog {s.IslandsMissingBog}, ") +
        Invariant($"no landing spots {s.IslandsWithoutLandingSpots}, bog rule violations {s.BogRuleViolations}, inland mouths {s.InlandRiverMouths}, ") +
        Invariant($"wasted near green {s.WastedNearGreen}"));
    var shown = findingsShown < 0 ? review.Findings : review.Findings.Take(findingsShown);
    foreach (var f in shown)
    {
        Console.WriteLine(Invariant($"    {f.Severity,-5} {f.Kind,-16} island {f.IslandIndex,3} at {f.Hex.Q},{f.Hex.R}: {f.Message}"));
    }

    Console.WriteLine();
}

if (!json && summaries.Count > 1)
{
    Console.WriteLine("findings per kind (error / warn / info), all seeds:");
    foreach (var (kind, t) in kindTotals)
    {
        Console.WriteLine(Invariant($"  {kind,-16} {t.Error} / {t.Warn} / {t.Info}"));
    }

    Console.WriteLine();
    Console.WriteLine("seeds, best first: seed  errors  warnings  info  cut-off hexes  landing spots");
    summaries.Sort(WorldReviewSummary.BestFirst);
    foreach (var s in summaries)
    {
        Console.WriteLine(Invariant($"  {s.Seed,6} {s.Errors,7} {s.Warnings,9} {s.Infos,5} {s.CutOffTiles,14} {s.LandingSpots,14}"));
    }
}

return 0;

static string Invariant(FormattableString text) => text.ToString(CultureInfo.InvariantCulture);

static List<int> ParseSeeds(string text)
{
    var result = new List<int>();
    foreach (var part in text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
    {
        var dash = part.IndexOf('-', 1);
        if (dash < 0)
        {
            result.Add(int.Parse(part, CultureInfo.InvariantCulture));
            continue;
        }

        var from = int.Parse(part[..dash], CultureInfo.InvariantCulture);
        var to = int.Parse(part[(dash + 1)..], CultureInfo.InvariantCulture);
        for (var s = from; s <= to; s++)
        {
            result.Add(s);
        }
    }

    return result;
}
