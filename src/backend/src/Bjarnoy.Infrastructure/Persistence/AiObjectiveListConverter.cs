using System.Text.Json;
using Bjarnoy.Domain.Ai;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an AI player's ordered objective list as a JSON array — unlike
/// <see cref="RiverTileListConverter"/>'s compact text encoding, plain
/// <c>System.Text.Json</c> is enough here: <see cref="AiObjective"/> is
/// deliberately shaped (see its own remarks) to round-trip through it
/// unchanged, and this column is never queried into or filtered on, only ever
/// read/written whole by <c>AiPlayerService</c>/the admin API, so there is no
/// reason to hand-roll a terser format the way rivers or hex lists need.
/// </summary>
public sealed class AiObjectiveListConverter : ValueConverter<List<AiObjective>, string>
{
    public AiObjectiveListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<AiObjective>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, objective) => HashCode.Combine(hash, objective)),
        v => v.ToList());

    private static string Serialise(List<AiObjective> objectives) => JsonSerializer.Serialize(objectives);

    private static List<AiObjective> Deserialise(string value) =>
        string.IsNullOrEmpty(value)
            ? []
            : JsonSerializer.Deserialize<List<AiObjective>>(value) ?? [];
}
