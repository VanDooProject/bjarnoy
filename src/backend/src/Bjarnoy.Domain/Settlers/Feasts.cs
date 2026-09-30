using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.Settlers;

/// <summary>
/// Town Square feasts (economy.md section 6): a settlement turns surplus wood,
/// stone and food into account renown, Travian-celebration style. The numbers
/// are tuned in the Economy lab — keep them in step with
/// <c>src/frontend/src/lib/economy/feasts.ts</c>.
/// </summary>
public static class Feasts
{
    /// <summary>Wood, stone and food (each) a level-1 Town Square feast costs.</summary>
    public const double CostBase = 800;

    /// <summary>Cost growth per Town Square level.</summary>
    public const double CostGrowth = 1.25;

    /// <summary>How long a feast runs before it grants its renown.</summary>
    public static readonly TimeSpan Duration = TimeSpan.FromHours(12);

    /// <summary>Renown a level-1 Town Square feast grants (the lab's tuned G1).</summary>
    public const double RenownBase = 3500;

    /// <summary>Renown growth per Town Square level (the lab's tuned g).</summary>
    public const double RenownGrowth = 1.15;

    /// <summary>Each of wood, stone and food a feast at <paramref name="townSquareLevel"/> costs, paid up front.</summary>
    public static ResourceAmounts CostFor(int townSquareLevel)
    {
        var each = CostBase * Math.Pow(CostGrowth, Math.Max(1, townSquareLevel) - 1);
        return new ResourceAmounts(each, each, each, 0);
    }

    /// <summary>Renown a finished feast at <paramref name="townSquareLevel"/> grants.</summary>
    public static double RenownFor(int townSquareLevel) =>
        RenownBase * Math.Pow(RenownGrowth, Math.Max(1, townSquareLevel) - 1);
}

/// <summary>A feast in progress at a settlement (game time).</summary>
public sealed record Feast(DateTimeOffset StartedAt, DateTimeOffset EndsAt, double RenownGain)
{
    public bool IsComplete(DateTimeOffset now) => now >= EndsAt;
}

/// <summary>Why a feast request was refused.</summary>
public enum FeastRejection
{
    None = 0,
    NoTownSquare,
    AlreadyRunning,
    NotEnoughResources,
}

/// <summary>The outcome of asking to hold a feast.</summary>
public sealed record FeastDecision(FeastRejection Rejection, Feast? Feast = null)
{
    public bool Accepted => Rejection == FeastRejection.None && Feast is not null;

    public static FeastDecision Rejected(FeastRejection reason) => new(reason);

    public static FeastDecision Accept(Feast feast) => new(FeastRejection.None, feast);
}
