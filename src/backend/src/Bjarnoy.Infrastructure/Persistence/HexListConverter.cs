using System.Globalization;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores a list of hexes as <c>"q,r q,r ..."</c>.
/// </summary>
/// <remarks>
/// A compact text encoding rather than JSON so the column reads the same on
/// SQLite and PostgreSQL without either provider's JSON support, and stays
/// legible in a database client.
/// </remarks>
public sealed class HexListConverter : ValueConverter<List<HexPoint>, string>
{
    public HexListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<HexPoint>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, point) => HashCode.Combine(hash, point)),
        v => v.ToList());

    private static string Serialise(List<HexPoint> points) =>
        string.Join(' ', points.Select(p => string.Create(
            CultureInfo.InvariantCulture, $"{p.Q},{p.R}")));

    private static List<HexPoint> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var points = new List<HexPoint>();
        foreach (var range in value.AsSpan().Split(' '))
        {
            var token = value.AsSpan()[range];
            var comma = token.IndexOf(',');
            if (comma < 0)
            {
                continue;
            }

            points.Add(new HexPoint(
                int.Parse(token[..comma], CultureInfo.InvariantCulture),
                int.Parse(token[(comma + 1)..], CultureInfo.InvariantCulture)));
        }

        return points;
    }
}
