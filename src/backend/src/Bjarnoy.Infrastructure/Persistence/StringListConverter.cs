using System.Text.Json;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>Stores a list of strings as one JSON text column.</summary>
public sealed class StringListConverter : ValueConverter<List<string>, string>
{
    public StringListConverter()
        : base(v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<string>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, s) => HashCode.Combine(hash, s)),
        v => v.ToList());

    private static List<string> Deserialise(string value) =>
        string.IsNullOrEmpty(value) ? [] : JsonSerializer.Deserialize<List<string>>(value) ?? [];
}
