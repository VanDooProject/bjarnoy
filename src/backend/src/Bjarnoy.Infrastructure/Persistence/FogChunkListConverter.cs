using System.Globalization;
using Bjarnoy.Domain.World;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores a list of fog chunks as <c>"u,v u,v ..."</c> — the same compact text encoding as <see cref="HexListConverter"/>.
/// </summary>
public sealed class FogChunkListConverter : ValueConverter<List<FogChunkCoord>, string>
{
    public FogChunkListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<FogChunkCoord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, chunk) => HashCode.Combine(hash, chunk)),
        v => v.ToList());

    private static string Serialise(List<FogChunkCoord> chunks) =>
        string.Join(' ', chunks.Select(c => string.Create(CultureInfo.InvariantCulture, $"{c.U},{c.V}")));

    private static List<FogChunkCoord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var chunks = new List<FogChunkCoord>();
        foreach (var range in value.AsSpan().Split(' '))
        {
            var token = value.AsSpan()[range];
            var comma = token.IndexOf(',');
            if (comma < 0)
            {
                continue;
            }

            chunks.Add(new FogChunkCoord(
                int.Parse(token[..comma], CultureInfo.InvariantCulture),
                int.Parse(token[(comma + 1)..], CultureInfo.InvariantCulture)));
        }

        return chunks;
    }
}
