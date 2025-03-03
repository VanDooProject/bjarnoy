namespace BG.Core.ValueObjects;

public readonly struct EntityId
{
    private readonly byte[] _value;

    public EntityId(byte[] value)
    {
        if (value == null || value.Length != 16)
            throw new ArgumentException("Entity ID must be 16 bytes", nameof(value));
            
        _value = value;
    }

    public byte[] Value => _value;

    public static EntityId NewId()
    {
        return new EntityId(Guid.CreateVersion7().ToByteArray());
    }

    public static EntityId FromGuid(Guid guid)
    {
        return new EntityId(guid.ToByteArray());
    }

    public Guid ToGuid()
    {
        return new Guid(_value);
    }

    public override bool Equals(object? obj)
    {
        if (obj is EntityId other)
            return _value.SequenceEqual(other._value);
        return false;
    }

    public override int GetHashCode()
    {
        return BitConverter.ToInt32(_value, 0);
    }

    public static bool operator ==(EntityId left, EntityId right)
    {
        return left.Equals(right);
    }

    public static bool operator !=(EntityId left, EntityId right)
    {
        return !left.Equals(right);
    }
}