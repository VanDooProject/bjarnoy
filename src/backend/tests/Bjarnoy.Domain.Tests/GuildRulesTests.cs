using Bjarnoy.Domain.Guilds;

namespace Bjarnoy.Domain.Tests;

public class GuildRulesTests
{
    [Theory]
    [InlineData(0, 10)]
    [InlineData(1, 10)]
    [InlineData(2, 11)]
    [InlineData(20, 20)]
    [InlineData(-5, 10)]
    public void MemberCap_adds_half_the_highest_longhouse_level_to_the_base(int longhouseLevel, int expected)
    {
        Assert.Equal(expected, GuildRules.MemberCap(longhouseLevel));
    }

    [Fact]
    public void MaxActivePeaceTreaties_is_one()
    {
        Assert.Equal(1, GuildRules.MaxActivePeaceTreaties);
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
