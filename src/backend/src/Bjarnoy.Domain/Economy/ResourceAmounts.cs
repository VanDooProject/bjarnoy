using System.Globalization;

namespace Bjarnoy.Domain.Economy;

/// <summary>
/// The four stocks from <c>prototypes/MECHANICS.md</c>: wood, stone, grain and
/// silver. Used both as a quantity (what a settlement holds) and as a rate
/// (what it produces per hour).
/// </summary>
/// <remarks>
/// <para>
/// A struct with four named fields rather than a dictionary keyed by an enum:
/// the set is fixed by the game design, and this way "how much wood" is a
/// compile-time question with no lookup and no missing-key case.
/// </para>
/// <para>
/// Amounts are <see cref="double"/> because accrual is continuous — a rate of
/// 615/h over 18 minutes is 184.5 — and rounding at each settle would leak
/// value. Display rounds down; the stored value keeps the fraction.
/// </para>
/// </remarks>
public readonly record struct ResourceAmounts(double Wood, double Stone, double Grain, double Silver)
{
    public static ResourceAmounts Zero => default;

    public static ResourceAmounts Uniform(double value) => new(value, value, value, value);

    public static ResourceAmounts operator +(ResourceAmounts a, ResourceAmounts b) =>
        new(a.Wood + b.Wood, a.Stone + b.Stone, a.Grain + b.Grain, a.Silver + b.Silver);

    public static ResourceAmounts operator -(ResourceAmounts a, ResourceAmounts b) =>
        new(a.Wood - b.Wood, a.Stone - b.Stone, a.Grain - b.Grain, a.Silver - b.Silver);

    public static ResourceAmounts operator *(ResourceAmounts a, double factor) =>
        new(a.Wood * factor, a.Stone * factor, a.Grain * factor, a.Silver * factor);

    public static ResourceAmounts operator *(double factor, ResourceAmounts a) => a * factor;

    /// <summary>
    /// True when this holds at least <paramref name="cost"/> of <em>every</em>
    /// resource — i.e. the cost is affordable.
    /// </summary>
    /// <remarks>
    /// Deliberately a named method rather than a <c>&gt;=</c> operator. The
    /// legacy <c>Resources</c> defined <c>&lt;</c> and <c>&gt;</c> as
    /// "every component compares true", which reads like a total order but is
    /// not one, and produced a real affordability bug: <c>BuildHelper</c>
    /// rejected a build only when the player was short on *every* resource, so
    /// having plenty of wood and no stone passed the check.
    /// </remarks>
    public bool Covers(ResourceAmounts cost) =>
        Wood >= cost.Wood && Stone >= cost.Stone && Grain >= cost.Grain && Silver >= cost.Silver;

    /// <summary>Component-wise minimum — used to clamp a stock to its storage capacity.</summary>
    public ResourceAmounts ClampTo(ResourceAmounts capacity) => new(
        Math.Min(Wood, capacity.Wood),
        Math.Min(Stone, capacity.Stone),
        Math.Min(Grain, capacity.Grain),
        Math.Min(Silver, capacity.Silver));

    /// <summary>Floors every component at zero.</summary>
    /// <remarks>
    /// The legacy subtraction operator carried a "TODO: what should happen if
    /// values get negative?" and simply let them go negative.
    /// </remarks>
    public ResourceAmounts ClampToZero() => new(
        Math.Max(Wood, 0), Math.Max(Stone, 0), Math.Max(Grain, 0), Math.Max(Silver, 0));

    public bool IsZero => Wood == 0 && Stone == 0 && Grain == 0 && Silver == 0;

    /// <summary>True when no component is negative.</summary>
    public bool IsNonNegative => Wood >= 0 && Stone >= 0 && Grain >= 0 && Silver >= 0;

    /// <summary>Whole units, as a player sees them. Always rounds down.</summary>
    public ResourceAmounts Floor() => new(
        Math.Floor(Wood), Math.Floor(Stone), Math.Floor(Grain), Math.Floor(Silver));

    public override string ToString() => string.Create(
        CultureInfo.InvariantCulture,
        $"wood {Wood:0.##}, stone {Stone:0.##}, grain {Grain:0.##}, silver {Silver:0.##}");
}
