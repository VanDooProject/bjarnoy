using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores a list of GUIDs as one comma-separated string — same reasoning as <see cref="DoubleListConverter"/>: a
/// compact text encoding that reads the same on SQLite and PostgreSQL, used for an API key's world allow-list.
/// </summary>
public sealed class GuidListConverter : ValueConverter<List<Guid>, string>
{
    public GuidListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<Guid>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, g) => HashCode.Combine(hash, g)),
        v => v.ToList());

    private static string Serialise(List<Guid> values) => string.Join(',', values);

    private static List<Guid> Deserialise(string value) =>
        string.IsNullOrEmpty(value)
            ? []
            : [.. value.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(Guid.Parse)];
}
