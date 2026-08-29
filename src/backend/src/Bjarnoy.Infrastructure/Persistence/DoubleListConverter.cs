using System.Globalization;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores a list of doubles as a space-separated string, round-trip exact
/// ("R" format). Same reasoning as <see cref="HexListConverter"/>: a compact
/// text encoding that reads the same on SQLite and PostgreSQL — used for an
/// <c>Army</c>'s <c>Movement.CumulativeHours</c>/<c>ReturnCumulativeHours</c>.
/// </summary>
public sealed class DoubleListConverter : ValueConverter<List<double>, string>
{
    public DoubleListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<double>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, d) => HashCode.Combine(hash, d)),
        v => v.ToList());

    private static string Serialise(List<double> values) =>
        string.Join(' ', values.Select(v => v.ToString("R", CultureInfo.InvariantCulture)));

    private static List<double> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var result = new List<double>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            result.Add(double.Parse(token, CultureInfo.InvariantCulture));
        }

        return result;
    }
}
