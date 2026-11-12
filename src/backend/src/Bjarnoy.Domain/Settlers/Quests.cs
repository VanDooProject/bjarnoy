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
/// <param name="Progress">
/// Where the settlement stands toward the quest as (current, target), or <see langword="null"/> for a quest
/// without a counted goal. Current is clamped to the target but not below 0.
/// </param>
public sealed record Quest(
    string Id,
    int Bit,
    ResourceAmounts Reward,
    Func<Settlement, bool> IsCompleted,
    Func<Settlement, QuestProgress>? Progress = null)
{
    /// <summary>This quest's bit in the claimed mask.</summary>
    public int Mask => 1 << Bit;
}

/// <summary>How far a settlement is toward a quest's goal; <see cref="Current"/> never exceeds <see cref="Target"/>.</summary>
public readonly record struct QuestProgress(int Current, int Target)
{
    /// <summary>Progress of <paramref name="current"/> toward <paramref name="target"/>, clamped to the target.</summary>
    public static QuestProgress Of(int current, int target) => new(Math.Min(current, target), target);
}

/// <summary>The onboarding quest list, in the order the tutorial presents it.</summary>
public static class Quests
{
    private const int SpearmenBit = 6;

    /// <summary>All quests in presentation order.</summary>
    public static IReadOnlyList<Quest> All { get; } =
    [
        new("producers3", 0, new ResourceAmounts(150, 120, 80, 0), s => s.ProducerCount >= 3,
            s => QuestProgress.Of(s.ProducerCount, 3)),
        new("longhouse2", 1, new ResourceAmounts(250, 200, 150, 0), s => s.LonghouseLevel >= 2,
            s => QuestProgress.Of(s.LonghouseLevel, 2)),
        new("storagehouse1", 2, new ResourceAmounts(200, 200, 200, 0),
            s => s.Buildings.Any(b => b.Type == BuildingType.StorageHouse)),
        new("producers6", 3, new ResourceAmounts(200, 150, 100, 0), s => s.ProducerCount >= 6,
            s => QuestProgress.Of(s.ProducerCount, 6)),
        new("longhouse3", 4, new ResourceAmounts(400, 300, 200, 0), s => s.LonghouseLevel >= 3,
            s => QuestProgress.Of(s.LonghouseLevel, 3)),
        new("tower3", 8, new ResourceAmounts(400, 300, 200, 0), s => s.TowerLevel >= 3,
            s => QuestProgress.Of(s.TowerLevel, 3)),
        new("longhouse5", 5, new ResourceAmounts(800, 600, 400, 0), s => s.LonghouseLevel >= 5,
            s => QuestProgress.Of(s.LonghouseLevel, 5)),
        new("spearmen5", SpearmenBit, new ResourceAmounts(500, 400, 300, 0), s => s.TroopsTrained || s.FightingLandUnitCount >= 5,
            s => s.TroopsTrained ? new QuestProgress(5, 5) : QuestProgress.Of(s.FightingLandUnitCount, 5)),
        // Unlocked once the troops were trained (the stored latch); claims never gate it.
        new("hunt1", 7, new ResourceAmounts(400, 300, 300, 0),
            s => s.TroopsTrained && s.HuntStarted),
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

    /// <summary>Quests are enabled only on a player's first settlement.</summary>
    NotFirstSettlement,
}

/// <summary>The outcome of asking to claim a quest reward.</summary>
public sealed record QuestDecision(QuestRejection Rejection, Quest? Quest = null)
{
    public bool Accepted => Rejection == QuestRejection.None && Quest is not null;

    public static QuestDecision Rejected(QuestRejection reason) => new(reason);

    public static QuestDecision Accept(Quest quest) => new(QuestRejection.None, quest);
}
