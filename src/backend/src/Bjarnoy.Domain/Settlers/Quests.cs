using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Settlers;

/// <summary>
/// One onboarding quest (<c>docs/design/economy.md</c> section 7): a condition
/// over the settled settlement and a resource reward, claimed by hand exactly
/// once per settlement. A quest never rewards a building.
/// </summary>
/// <param name="Id">The stable wire id the API and frontend use.</param>
/// <param name="Bit">The quest's bit in <see cref="Settlement.ClaimedQuests"/> — never renumber.</param>
/// <param name="Reward">Wood, stone and food (no iron) paid on claim.</param>
/// <param name="IsCompleted">Whether the (settled) settlement meets the quest's condition.</param>
public sealed record Quest(string Id, int Bit, ResourceAmounts Reward, Func<Settlement, bool> IsCompleted)
{
    /// <summary>This quest's bit in the claimed mask.</summary>
    public int Mask => 1 << Bit;
}

/// <summary>The onboarding quest list, in the order the tutorial presents it.</summary>
public static class Quests
{
    /// <summary>All quests in presentation order.</summary>
    public static IReadOnlyList<Quest> All { get; } =
    [
        new("producers3", 0, new ResourceAmounts(150, 120, 80, 0), s => s.ProducerCount >= 3),
        new("longhouse2", 1, new ResourceAmounts(250, 200, 150, 0), s => s.LonghouseLevel >= 2),
        new("storagehouse1", 2, new ResourceAmounts(200, 200, 200, 0),
            s => s.Buildings.Any(b => b.Type == BuildingType.StorageHouse)),
        new("producers6", 3, new ResourceAmounts(200, 150, 100, 0), s => s.ProducerCount >= 6),
        new("longhouse3", 4, new ResourceAmounts(400, 300, 200, 0), s => s.LonghouseLevel >= 3),
        new("longhouse5", 5, new ResourceAmounts(800, 600, 400, 0), s => s.LonghouseLevel >= 5),
    ];

    /// <summary>The quest with <paramref name="id"/>, or <see langword="null"/>.</summary>
    public static Quest? Find(string? id) =>
        All.FirstOrDefault(q => string.Equals(q.Id, id, StringComparison.Ordinal));

    /// <summary>
    /// Whether <paramref name="type"/> is a resource producer for the
    /// "n producers built" quests: any building other than the Longhouse whose
    /// level-1 definition yields wood, stone, food or iron of its own (so the
    /// Lumberjack, Quarry, Clay Brickworks, Farms and Fishing Hut count; storage,
    /// towers and the radius-boost buildings do not).
    /// </summary>
    public static bool IsProducer(BuildingType type)
    {
        if (type == BuildingType.Longhouse)
        {
            return false;
        }

        var p = BuildingCatalogue.TryGet(type, 1)?.ProductionPerHour;
        return p is { } o && (o.Wood > 0 || o.Stone > 0 || o.Food > 0 || o.Iron > 0);
    }
}

/// <summary>Why a quest claim was refused.</summary>
public enum QuestRejection
{
    None = 0,
    UnknownQuest,
    AlreadyClaimed,
    NotCompleted,
}

/// <summary>The outcome of asking to claim a quest reward.</summary>
public sealed record QuestDecision(QuestRejection Rejection, Quest? Quest = null)
{
    public bool Accepted => Rejection == QuestRejection.None && Quest is not null;

    public static QuestDecision Rejected(QuestRejection reason) => new(reason);

    public static QuestDecision Accept(Quest quest) => new(QuestRejection.None, quest);
}
