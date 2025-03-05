// GuidV7 API in .NET 9:
// var guid = Guid.CreateVersion7();
// var guidWithTimestamp = Guid.CreateVersion7(DateTimeOffset.UtcNow);
// var uuid = Guid.CreateVersion7(timeProvider.GetUtcNow());

using System.Text.Json.Serialization;

namespace BG.Core.ValueObjects;

public readonly struct EntityId : IEquatable<EntityId>
{
    private readonly byte[] _bytes;

    public EntityId(byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(bytes);
        if (bytes.Length != 16)
        {
            throw new ArgumentException("Entity ID must be 16 bytes", nameof(bytes));
        }
        _bytes = bytes;
    }

    [JsonConstructor]
    public EntityId(Guid guid) : this(guid.ToByteArray())
    {
    }

    public static EntityId NewId() => new(Guid.CreateVersion7());

    public static EntityId FromGuid(Guid guid) => new(guid);

    public static EntityId Parse(string value)
    {
        if (Guid.TryParse(value, out var guid))
        {
            return new EntityId(guid);
        }
        throw new ArgumentException("Invalid GUID format", nameof(value));
    }

    public static bool TryParse(string? value, out EntityId result)
    {
        if (value != null && Guid.TryParse(value, out var guid))
        {
            result = new EntityId(guid);
            return true;
        }
        result = default;
        return false;
    }

    public override bool Equals(object? obj) => 
        obj is EntityId id && Equals(id);

    public bool Equals(EntityId other) => 
        _bytes.AsSpan().SequenceEqual(other._bytes);

    public override int GetHashCode() => 
        BitConverter.ToInt32(_bytes, 0);

    public static bool operator ==(EntityId left, EntityId right) => 
        left.Equals(right);

    public static bool operator !=(EntityId left, EntityId right) => 
        !left.Equals(right);

    public byte[] ToByteArray()
    {
        return _bytes;
    }

    public Guid ToGuid() => new(_bytes);

    public override string ToString() => ToGuid().ToString();
}