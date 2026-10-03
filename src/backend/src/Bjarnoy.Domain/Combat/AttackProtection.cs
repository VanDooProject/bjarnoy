namespace Bjarnoy.Domain.Combat;

/// <summary>Why <see cref="AttackProtection.Evaluate"/> let an attack through, or stopped it.</summary>
public enum AttackProtectionReason
{
    /// <summary>The target's account is at most <see cref="AttackProtection.MaxLonghouseGap"/> Longhouse levels below the attacker's.</summary>
    WithinSizeGap,

    /// <summary>Both settlements belong to the same user.</summary>
    SameOwner,

    /// <summary>The target is held by a system user (abandoned/unclaimed), which never counts as protected.</summary>
    UnownedTarget,

    /// <summary>The target's owner has not been active for <see cref="AttackProtection.InactivityThreshold"/>.</summary>
    InactiveTarget,

    /// <summary>The target's owner attacked the attacker's owner within <see cref="AttackProtection.RevengeWindow"/>.</summary>
    Revenge,

    /// <summary>The target is too far below the attacker and no exemption applies — the attack is turned back.</summary>
    SizeGapProtected,
}

/// <summary>The outcome of <see cref="AttackProtection.Evaluate"/>; <see cref="Protected"/> is true only for <see cref="AttackProtectionReason.SizeGapProtected"/>.</summary>
public sealed record AttackProtectionVerdict(
    bool Protected, AttackProtectionReason Reason, int AttackerLonghouseLevel, int DefenderLonghouseLevel);

/// <summary>
/// Anti-snowball protection (issue #336): an Attack or Raid may not land on an
/// account that is more than <see cref="MaxLonghouseGap"/> Longhouse levels
/// below the attacker's, unless the defender attacked first (revenge), has
/// gone quiet, or is not a real player. "Account size" is the highest Longhouse
/// level across a user's settlements in one world; the caller supplies it.
/// </summary>
public static class AttackProtection
{
    public const int MaxLonghouseGap = 5;

    /// <summary>How long (game time) after the defender's owner attacked the attacker's owner the attacker may hit back.</summary>
    public static readonly TimeSpan RevengeWindow = TimeSpan.FromHours(48);

    /// <summary>How long (wall time) an owner may stay away before they stop being protected.</summary>
    public static readonly TimeSpan InactivityThreshold = TimeSpan.FromDays(7);

    /// <remarks>Checked in order; the gap counts only an attacker above the defender, so a smaller attacker is always within it.</remarks>
    public static AttackProtectionVerdict Evaluate(
        bool sameOwner,
        bool targetUnowned,
        int attackerLonghouseLevel,
        int defenderLonghouseLevel,
        bool targetInactive,
        bool revengeOpen)
    {
        AttackProtectionVerdict Verdict(bool isProtected, AttackProtectionReason reason) =>
            new(isProtected, reason, attackerLonghouseLevel, defenderLonghouseLevel);

        if (sameOwner)
        {
            return Verdict(false, AttackProtectionReason.SameOwner);
        }

        if (targetUnowned)
        {
            return Verdict(false, AttackProtectionReason.UnownedTarget);
        }

        if (attackerLonghouseLevel - defenderLonghouseLevel <= MaxLonghouseGap)
        {
            return Verdict(false, AttackProtectionReason.WithinSizeGap);
        }

        if (targetInactive)
        {
            return Verdict(false, AttackProtectionReason.InactiveTarget);
        }

        if (revengeOpen)
        {
            return Verdict(false, AttackProtectionReason.Revenge);
        }

        return Verdict(true, AttackProtectionReason.SizeGapProtected);
    }
}
