using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Shrines;

/// <summary>
/// One carved rune a settlement holds — either sitting in storage
/// (<see cref="SlottedAt"/> is <see langword="null"/>) or slotted into the
/// shrine standing on that hex.
/// </summary>
public sealed record RuneInstance
{
    public required Guid Id { get; init; }

    public required RuneType Type { get; init; }

    public required RuneRarity Rarity { get; init; }

    /// <summary>The shrine's hex this rune is slotted into, or <see langword="null"/> if unslotted.</summary>
    public HexCoord? SlottedAt { get; init; }
}
