using System.Globalization;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an island's Utgard walls as <c>"q,r,ring,piece,dir,gate,level ..."</c> — one space-separated token per wall hex, the same
/// compact text encoding as <see cref="CampListConverter"/>. <c>gate</c> is <c>1</c> or <c>0</c>.
/// </summary>
public sealed class UtgardWallListConverter : ValueConverter<List<UtgardWallRecord>, string>
{
    public UtgardWallListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<UtgardWallRecord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, wall) => HashCode.Combine(hash, wall)),
        v => v.ToList());

    private static string Serialise(List<UtgardWallRecord> walls) =>
        string.Join(' ', walls.Select(w => string.Create(
            CultureInfo.InvariantCulture, $"{w.Q},{w.R},{w.Ring},{w.Piece},{w.Dir},{(w.IsGate ? 1 : 0)},{w.Level}")));

    private static List<UtgardWallRecord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var walls = new List<UtgardWallRecord>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var f = token.Split(',');
            walls.Add(new UtgardWallRecord(
                int.Parse(f[0], CultureInfo.InvariantCulture),
                int.Parse(f[1], CultureInfo.InvariantCulture),
                int.Parse(f[2], CultureInfo.InvariantCulture),
                int.Parse(f[3], CultureInfo.InvariantCulture),
                int.Parse(f[4], CultureInfo.InvariantCulture),
                f[5] == "1",
                int.Parse(f[6], CultureInfo.InvariantCulture)));
        }

        return walls;
    }
}

/// <summary>Stores an island's Jötun watchtowers as <c>"q,r,orientation ..."</c> — one space-separated token per tower.</summary>
public sealed class JotunTowerListConverter : ValueConverter<List<JotunTowerRecord>, string>
{
    public JotunTowerListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<JotunTowerRecord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, tower) => HashCode.Combine(hash, tower)),
        v => v.ToList());

    private static string Serialise(List<JotunTowerRecord> towers) =>
        string.Join(' ', towers.Select(t => string.Create(CultureInfo.InvariantCulture, $"{t.Q},{t.R},{t.Orientation}")));

    private static List<JotunTowerRecord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var towers = new List<JotunTowerRecord>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var f = token.Split(',');
            towers.Add(new JotunTowerRecord(
                int.Parse(f[0], CultureInfo.InvariantCulture),
                int.Parse(f[1], CultureInfo.InvariantCulture),
                int.Parse(f[2], CultureInfo.InvariantCulture)));
        }

        return towers;
    }
}
