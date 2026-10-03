using Bjarnoy.Domain.Combat;

namespace Bjarnoy.Domain.Tests.Combat;

public class AttackProtectionTests
{
    private static AttackProtectionVerdict Evaluate(
        int attacker, int defender, bool sameOwner = false, bool unowned = false, bool inactive = false, bool revenge = false) =>
        AttackProtection.Evaluate(sameOwner, unowned, attacker, defender, inactive, revenge);

    [Fact]
    public void Gap_of_exactly_five_is_allowed()
    {
        var verdict = Evaluate(attacker: 10, defender: 5);

        Assert.False(verdict.Protected);
        Assert.Equal(AttackProtectionReason.WithinSizeGap, verdict.Reason);
    }

    [Fact]
    public void Gap_of_six_is_protected()
    {
        var verdict = Evaluate(attacker: 10, defender: 4);

        Assert.True(verdict.Protected);
        Assert.Equal(AttackProtectionReason.SizeGapProtected, verdict.Reason);
        Assert.Equal(10, verdict.AttackerLonghouseLevel);
        Assert.Equal(4, verdict.DefenderLonghouseLevel);
    }

    [Theory]
    [InlineData(1, 20)]
    [InlineData(3, 3)]
    [InlineData(0, 30)]
    public void Smaller_or_equal_attacker_is_always_allowed(int attacker, int defender)
    {
        var verdict = Evaluate(attacker, defender);

        Assert.False(verdict.Protected);
        Assert.Equal(AttackProtectionReason.WithinSizeGap, verdict.Reason);
    }

    [Fact]
    public void Same_owner_is_exempt()
    {
        var verdict = Evaluate(attacker: 20, defender: 1, sameOwner: true);

        Assert.False(verdict.Protected);
        Assert.Equal(AttackProtectionReason.SameOwner, verdict.Reason);
    }

    [Fact]
    public void Unowned_target_is_exempt()
    {
        var verdict = Evaluate(attacker: 20, defender: 1, unowned: true);

        Assert.False(verdict.Protected);
        Assert.Equal(AttackProtectionReason.UnownedTarget, verdict.Reason);
    }

    [Fact]
    public void Inactive_target_is_exempt()
    {
        var verdict = Evaluate(attacker: 20, defender: 1, inactive: true);

        Assert.False(verdict.Protected);
        Assert.Equal(AttackProtectionReason.InactiveTarget, verdict.Reason);
    }

    [Fact]
    public void Open_revenge_is_exempt()
    {
        var verdict = Evaluate(attacker: 20, defender: 1, revenge: true);

        Assert.False(verdict.Protected);
        Assert.Equal(AttackProtectionReason.Revenge, verdict.Reason);
    }

    [Fact]
    public void Exemptions_are_reported_in_priority_order()
    {
        Assert.Equal(AttackProtectionReason.SameOwner, Evaluate(20, 1, sameOwner: true, unowned: true, inactive: true, revenge: true).Reason);
        Assert.Equal(AttackProtectionReason.UnownedTarget, Evaluate(20, 1, unowned: true, inactive: true, revenge: true).Reason);
        Assert.Equal(AttackProtectionReason.InactiveTarget, Evaluate(20, 1, inactive: true, revenge: true).Reason);
    }
}
