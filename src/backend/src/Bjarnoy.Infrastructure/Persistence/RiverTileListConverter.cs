using System.Globalization;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an island's river tiles as <c>"q,r,shape,ins,out ..."</c> — one
/// space-separated token per tile, mirroring <see cref="HexListConverter"/>'s
/// own compact text encoding for the same reasons (no JSON support needed
/// from either provider, still legible in a database client).
/// </summary>
/// <remarks>
/// Per tile: <c>Q,R,Shape,InDirectionDigits,OutDirectionDigit</c> — each
/// in-direction is a single digit (0-5), concatenated with no separator
/// since a tile never has more than two (empty for a spring's zero); the
/// out-direction is one digit, or an empty field for a mouth (or a
/// confluence that's also a river's mouth). The field count is fixed, so an
/// empty in-directions or out-direction field still round-trips correctly
/// through a plain comma split.
/// </remarks>
public sealed class RiverTileListConverter : ValueConverter<List<RiverTileRecord>, string>
{
    public RiverTileListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<RiverTileRecord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, tile) => HashCode.Combine(hash, tile)),
        v => v.ToList());

    private static string Serialise(List<RiverTileRecord> tiles) =>
        string.Join(' ', tiles.Select(SerialiseTile));

    private static string SerialiseTile(RiverTileRecord tile)
    {
        var ins = string.Concat(tile.InDirections.Select(d => d.ToString(CultureInfo.InvariantCulture)));
        var outDigit = tile.OutDirection is { } outDirection
            ? outDirection.ToString(CultureInfo.InvariantCulture)
            : string.Empty;

        return string.Create(CultureInfo.InvariantCulture, $"{tile.Q},{tile.R},{tile.Shape},{ins},{outDigit}");
    }

    private static List<RiverTileRecord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var tiles = new List<RiverTileRecord>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var fields = token.Split(',');
            var q = int.Parse(fields[0], CultureInfo.InvariantCulture);
            var r = int.Parse(fields[1], CultureInfo.InvariantCulture);
            var shape = int.Parse(fields[2], CultureInfo.InvariantCulture);
            var ins = fields[3].Select(c => c - '0').ToList();
            int? outDirection = fields[4].Length == 0 ? null : fields[4][0] - '0';

            tiles.Add(new RiverTileRecord(q, r, shape, ins, outDirection));
        }

        return tiles;
    }
}
