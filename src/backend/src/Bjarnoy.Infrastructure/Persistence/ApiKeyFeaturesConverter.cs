using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an API key's feature grants as one text column, <c>"settlements:rw;worlds:r"</c>: feature id, a colon, then
/// <c>r</c> (<see cref="ApiKeyAccess.Read"/>) or <c>rw</c> (<see cref="ApiKeyAccess.ReadWrite"/>), entries separated by
/// semicolons and written in alphabetical feature order so equal grants always serialise identically.
/// </summary>
/// <remarks>
/// Feature ids are lowercase letters, digits, dots and dashes, so neither separator can occur in one. An entry that
/// does not parse (a feature removed from the catalogue is still just a string here) is kept if its level parses and
/// skipped otherwise; whether a stored feature id is still <em>known</em> is the API layer's concern.
/// </remarks>
public sealed class ApiKeyFeaturesConverter : ValueConverter<Dictionary<string, ApiKeyAccess>, string>
{
    public ApiKeyFeaturesConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<Dictionary<string, ApiKeyAccess>> Comparer { get; } = new(
        (a, b) => a != null && b != null && SameGrants(a, b),
        v => v.Aggregate(0, (hash, kv) => hash ^ HashCode.Combine(kv.Key, kv.Value)),
        v => new Dictionary<string, ApiKeyAccess>(v));

    private static bool SameGrants(Dictionary<string, ApiKeyAccess> a, Dictionary<string, ApiKeyAccess> b)
    {
        if (a.Count != b.Count)
        {
            return false;
        }

        foreach (var (feature, level) in a)
        {
            if (!b.TryGetValue(feature, out var other) || other != level)
            {
                return false;
            }
        }

        return true;
    }

    private static string Serialise(Dictionary<string, ApiKeyAccess> values) =>
        string.Join(
            ';',
            values
                .Where(kv => kv.Value != ApiKeyAccess.None)
                .OrderBy(kv => kv.Key, StringComparer.Ordinal)
                .Select(kv => $"{kv.Key}:{(kv.Value == ApiKeyAccess.ReadWrite ? "rw" : "r")}"));

    private static Dictionary<string, ApiKeyAccess> Deserialise(string value)
    {
        var result = new Dictionary<string, ApiKeyAccess>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(value))
        {
            return result;
        }

        foreach (var entry in value.Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var colon = entry.LastIndexOf(':');
            if (colon <= 0)
            {
                continue;
            }

            var level = entry[(colon + 1)..] switch
            {
                "r" => ApiKeyAccess.Read,
                "rw" => ApiKeyAccess.ReadWrite,
                _ => ApiKeyAccess.None,
            };
            if (level != ApiKeyAccess.None)
            {
                result[entry[..colon]] = level;
            }
        }

        return result;
    }
}
