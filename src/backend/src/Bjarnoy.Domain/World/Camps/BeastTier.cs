namespace Bjarnoy.Domain.World;

/// <summary>The three tiers of beast a wildlife camp's garrison is made of — see <c>docs/design/wildlife-camps.md</c>, "Gameplay".</summary>
public enum BeastTier
{
    Young = 0,
    Adult = 1,
    Alpha = 2,
}

/// <summary>Wire names of <see cref="BeastTier"/>.</summary>
public static class BeastTierExtensions
{
    /// <summary>The lowercase name used on the wire and in the beast catalogue: <c>young</c>, <c>adult</c>, <c>alpha</c>.</summary>
    public static string ToWireName(this BeastTier tier) => tier switch
    {
        BeastTier.Young => "young",
        BeastTier.Adult => "adult",
        BeastTier.Alpha => "alpha",
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, null),
    };
}
