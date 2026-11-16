using System.Text.Json;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>Stores the anonymous identities of an approved key request as one JSON text column.</summary>
public sealed class AnonymousAccountGrantListConverter : ValueConverter<List<AnonymousAccountGrant>, string>
{
    public AnonymousAccountGrantListConverter()
        : base(v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null), v => Deserialise(v))
    {
    }

    public static ValueComparer<List<AnonymousAccountGrant>> Comparer { get; } = new(
        (a, b) => a != null && b != null && a.SequenceEqual(b),
        v => v.Aggregate(0, (hash, g) => HashCode.Combine(hash, g)),
        v => v.ToList());

    private static List<AnonymousAccountGrant> Deserialise(string value) =>
        string.IsNullOrEmpty(value) ? [] : JsonSerializer.Deserialize<List<AnonymousAccountGrant>>(value) ?? [];
}
