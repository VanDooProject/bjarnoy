using Bjarnoy.Domain.Guilds;

namespace Bjarnoy.Domain.Tests;

public class GuildRulesTests
{
    [Theory]
    [InlineData(GuildFeeTier.Copper, 10)]
    [InlineData(GuildFeeTier.Silver, 20)]
    [InlineData(GuildFeeTier.Gold, 30)]
    public void MemberCapBase_matches_the_tier(GuildFeeTier tier, int expected)
    {
        Assert.Equal(expected, GuildRules.MemberCapBase(tier));
    }

    [Theory]
    [InlineData(GuildFeeTier.Copper, 0, 10)]
    [InlineData(GuildFeeTier.Copper, 1, 10)]
    [InlineData(GuildFeeTier.Copper, 2, 11)]
    [InlineData(GuildFeeTier.Gold, 20, 40)]
    public void MemberCap_adds_half_the_highest_longhouse_level(GuildFeeTier tier, int longhouseLevel, int expected)
    {
        Assert.Equal(expected, GuildRules.MemberCap(tier, longhouseLevel));
    }

    [Fact]
    public void MemberCap_never_counts_a_negative_longhouse_level()
    {
        Assert.Equal(GuildRules.MemberCapBase(GuildFeeTier.Copper), GuildRules.MemberCap(GuildFeeTier.Copper, -5));
    }

    [Theory]
    [InlineData(GuildFeeTier.Copper, 1)]
    [InlineData(GuildFeeTier.Silver, 3)]
    [InlineData(GuildFeeTier.Gold, 6)]
    public void MaxActivePeaceTreaties_matches_the_tier(GuildFeeTier tier, int expected)
    {
        Assert.Equal(expected, GuildRules.MaxActivePeaceTreaties(tier));
    }

    [Theory]
    [InlineData(GuildFeeTier.Copper, 50)]
    [InlineData(GuildFeeTier.Silver, 200)]
    [InlineData(GuildFeeTier.Gold, 600)]
    public void FeeCost_is_uniform_across_every_resource(GuildFeeTier tier, double expected)
    {
        var cost = GuildRules.FeeCost(tier);

        Assert.Equal(expected, cost.Wood);
        Assert.Equal(expected, cost.Stone);
        Assert.Equal(expected, cost.Food);
        Assert.Equal(expected, cost.Iron);
    }

    [Fact]
    public void Perks_scale_up_with_tier_and_only_gold_unlocks_unit_support()
    {
        var copper = GuildRules.Perks(GuildFeeTier.Copper);
        var silver = GuildRules.Perks(GuildFeeTier.Silver);
        var gold = GuildRules.Perks(GuildFeeTier.Gold);

        Assert.Equal(0.0, copper.TradeCapacityBonus);
        Assert.False(copper.AllowUnitSupport);

        Assert.True(silver.TradeCapacityBonus > copper.TradeCapacityBonus);
        Assert.False(silver.AllowUnitSupport);

        Assert.True(gold.TradeCapacityBonus > silver.TradeCapacityBonus);
        Assert.True(gold.AllowUnitSupport);
    }

    [Theory]
    [InlineData(GuildRole.Leader, "leader")]
    [InlineData(GuildRole.Officer, "officer")]
    [InlineData(GuildRole.Member, "member")]
    public void GuildRole_wire_names_round_trip(GuildRole role, string expected)
    {
        Assert.Equal(expected, role.ToWireName());
    }

    [Theory]
    [InlineData(GuildFeeTier.Copper, "copper")]
    [InlineData(GuildFeeTier.Silver, "silver")]
    [InlineData(GuildFeeTier.Gold, "gold")]
    public void GuildFeeTier_wire_names_round_trip(GuildFeeTier tier, string expected)
    {
        Assert.Equal(expected, tier.ToWireName());
    }

    [Theory]
    [InlineData(GuildBoardTopicKind.Discussion, "discussion")]
    [InlineData(GuildBoardTopicKind.Announcement, "announcement")]
    [InlineData(GuildBoardTopicKind.Report, "report")]
    public void GuildBoardTopicKind_wire_names_round_trip(GuildBoardTopicKind kind, string expected)
    {
        Assert.Equal(expected, kind.ToWireName());
    }

    [Theory]
    [InlineData(PeaceTreatyStatus.Proposed, "proposed")]
    [InlineData(PeaceTreatyStatus.Active, "active")]
    [InlineData(PeaceTreatyStatus.Rejected, "rejected")]
    [InlineData(PeaceTreatyStatus.Withdrawn, "withdrawn")]
    [InlineData(PeaceTreatyStatus.Broken, "broken")]
    public void PeaceTreatyStatus_wire_names_round_trip(PeaceTreatyStatus status, string expected)
    {
        Assert.Equal(expected, status.ToWireName());
    }
}
