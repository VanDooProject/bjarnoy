using System.Globalization;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>
/// Stores an island's giants as <c>"q,r,family,orientation ..."</c> —
/// one space-separated token per giant, mirroring
/// <see cref="RiverTileListConverter"/>'s own compact text encoding for the
/// same reasons (no JSON support needed from either provider, still legible
/// in a database client). A giant's family name never contains a comma or a
/// space (see <c>GiantGenerator.MountainFamily</c> and any future family
/// added alongside it), so a plain split is safe.
/// </summary>
public sealed class GiantListConverter : ValueConverter<List<GiantRecord>, string>
{
    public GiantListConverter()
        : base(v => Serialise(v), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<GiantRecord>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, giant) => HashCode.Combine(hash, giant)),
        v => v.ToList());

    private static string Serialise(List<GiantRecord> giants) =>
        string.Join(' ', giants.Select(SerialiseGiant));

    private static string SerialiseGiant(GiantRecord giant) =>
        string.Create(CultureInfo.InvariantCulture, $"{giant.Q},{giant.R},{giant.Family},{giant.Orientation}");

    private static List<GiantRecord> Deserialise(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return [];
        }

        var giants = new List<GiantRecord>();
        foreach (var token in value.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var fields = token.Split(',');
            var q = int.Parse(fields[0], CultureInfo.InvariantCulture);
            var r = int.Parse(fields[1], CultureInfo.InvariantCulture);
            var family = fields[2];
            var orientation = int.Parse(fields[3], CultureInfo.InvariantCulture);

            giants.Add(new GiantRecord(q, r, family, orientation));
        }

        return giants;
    }
}
