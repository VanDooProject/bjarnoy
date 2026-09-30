using System.Globalization;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an island's bog tiles as <c>"q,r,kind,ins,out,water ..."</c> — one space-separated token per tile, the same
/// compact text encoding as <see cref="RiverTileListConverter"/>.
/// </summary>
/// <remarks>
/// Per tile: <c>Q,R,Kind,InDirectionDigits,OutDirectionDigit,WaterEdgeDigits</c>. Directions are single digits (0-5)
/// concatenated with no separator (a tile has at most one in-direction and three water edges); the out-direction is one
/// digit or an empty field. The field count is fixed, so an empty field still round-trips through a plain comma split.
/// </remarks>
public sealed class BogTileListConverter : ValueConverter<List<BogTileRecord>, string>
{
    public BogTileListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<BogTileRecord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, tile) => HashCode.Combine(hash, tile)),
        v => v.ToList());

    private static string Serialise(List<BogTileRecord> tiles) =>
        string.Join(' ', tiles.Select(SerialiseTile));

    private static string SerialiseTile(BogTileRecord tile)
    {
        var ins = string.Concat(tile.InDirections.Select(d => d.ToString(CultureInfo.InvariantCulture)));
        var outDigit = tile.OutDirection is { } outDirection
            ? outDirection.ToString(CultureInfo.InvariantCulture)
            : string.Empty;
        var water = string.Concat(tile.WaterEdges.Select(d => d.ToString(CultureInfo.InvariantCulture)));

        return string.Create(CultureInfo.InvariantCulture, $"{tile.Q},{tile.R},{tile.Kind},{ins},{outDigit},{water}");
    }

    private static List<BogTileRecord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var tiles = new List<BogTileRecord>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var fields = token.Split(',');
            tiles.Add(new BogTileRecord(
                int.Parse(fields[0], CultureInfo.InvariantCulture),
                int.Parse(fields[1], CultureInfo.InvariantCulture),
                int.Parse(fields[2], CultureInfo.InvariantCulture),
                [.. fields[3].Select(c => c - '0')],
                fields[4].Length == 0 ? null : fields[4][0] - '0',
                [.. fields[5].Select(c => c - '0')]));
        }

        return tiles;
    }
}
