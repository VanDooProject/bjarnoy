using System.Globalization;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an island's wildlife camps as <c>"q,r,family,level,orientation ..."</c> — one
/// space-separated token per camp, the same compact text encoding as
/// <see cref="GiantListConverter"/>. A camp family name never contains a comma or a space.
/// </summary>
public sealed class CampListConverter : ValueConverter<List<CampRecord>, string>
{
    public CampListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<CampRecord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, camp) => HashCode.Combine(hash, camp)),
        v => v.ToList());

    private static string Serialise(List<CampRecord> camps) =>
        string.Join(' ', camps.Select(SerialiseCamp));

    private static string SerialiseCamp(CampRecord camp) =>
        string.Create(CultureInfo.InvariantCulture, $"{camp.Q},{camp.R},{camp.Family},{camp.Level},{camp.Orientation}");

    private static List<CampRecord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var camps = new List<CampRecord>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var fields = token.Split(',');
            camps.Add(new CampRecord(
                int.Parse(fields[0], CultureInfo.InvariantCulture),
                int.Parse(fields[1], CultureInfo.InvariantCulture),
                fields[2],
                int.Parse(fields[3], CultureInfo.InvariantCulture),
                int.Parse(fields[4], CultureInfo.InvariantCulture)));
        }

        return camps;
    }
}
