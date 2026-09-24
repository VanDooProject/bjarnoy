namespace Bjarnoy.Domain.Ai;

/// <summary>
/// Which profile an AI jarl reads from <see cref="AiProfiles"/> — see
/// <c>docs/design/ai-players.md</c>'s "Personalities" section. A personality
/// is only a bundle of weights and thresholds the planner reads; it is not a
/// separate code path. Adding one more entry here, plus a matching
/// <see cref="AiProfiles"/> row, is the whole change needed to add a
/// personality.
/// </summary>
public enum AiPersonality
{
    /// <summary>Leans on producers, storage, shrines and the longhouse. Never attacks.</summary>
    Economic = 0,

    /// <summary>An even split across roles. Attacks rarely, only with a clear edge.</summary>
    Balanced = 1,

    /// <summary>Leans on towers, spearmen/bowmen and storage. High garrison target. Never attacks.</summary>
    Defensive = 2,

    /// <summary>Leans on barracks, iron and axemen/berserkers. Raids whenever it is stronger.</summary>
    Aggressive = 3,
}

public static class AiPersonalityExtensions
{
    /// <summary>Lowercased wire name, matching the convention <c>BuildingTypeExtensions.ToWireName</c> sets.</summary>
    public static string ToWireName(this AiPersonality personality) => personality switch
    {
        AiPersonality.Economic => "economic",
        AiPersonality.Balanced => "balanced",
        AiPersonality.Defensive => "defensive",
        AiPersonality.Aggressive => "aggressive",
        _ => throw new ArgumentOutOfRangeException(nameof(personality), personality, "Unknown AI personality"),
    };

    /// <summary>Parses a wire name (or enum name) back to an <see cref="AiPersonality"/>, case-insensitively.</summary>
    public static bool TryParseWireName(string value, out AiPersonality personality)
    {
        foreach (var candidate in Enum.GetValues<AiPersonality>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase)
                || string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                personality = candidate;
                return true;
            }
        }

        personality = default;
        return false;
    }
}
