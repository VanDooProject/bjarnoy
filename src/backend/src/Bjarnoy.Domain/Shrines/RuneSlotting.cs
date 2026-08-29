using Bjarnoy.Domain.Buildings;

namespace Bjarnoy.Domain.Shrines;

/// <summary>Why slotting a rune into a shrine was refused.</summary>
public enum SlotRuneRejection
{
    None = 0,
    RuneNotFound,
    RuneAlreadySlotted,
    NoShrineOnHex,
    ShrineSlotsFull,
}

/// <summary>The outcome of slotting a rune into a shrine.</summary>
public sealed record SlotRuneResult(SlotRuneRejection Rejection, Settlement? Settlement = null)
{
    public bool Accepted => Rejection == SlotRuneRejection.None && Settlement is not null;

    public static SlotRuneResult Rejected(SlotRuneRejection reason) => new(reason);

    public static SlotRuneResult Accept(Settlement settlement) => new(SlotRuneRejection.None, settlement);
}

/// <summary>Why unslotting a rune was refused.</summary>
public enum UnslotRuneRejection
{
    None = 0,
    RuneNotFound,
    RuneNotSlotted,
}

/// <summary>The outcome of returning a slotted rune to storage.</summary>
public sealed record UnslotRuneResult(UnslotRuneRejection Rejection, Settlement? Settlement = null)
{
    public bool Accepted => Rejection == UnslotRuneRejection.None && Settlement is not null;

    public static UnslotRuneResult Rejected(UnslotRuneRejection reason) => new(reason);

    public static UnslotRuneResult Accept(Settlement settlement) => new(UnslotRuneRejection.None, settlement);
}
