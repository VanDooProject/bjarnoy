using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;

namespace Bjarnoy.Infrastructure.Tests;

public class EndgameListConverterTests
{
    private static readonly UtgardWallListConverter WallConverter = new();
    private static readonly JotunTowerListConverter TowerConverter = new();

    [Fact]
    public void Walls_round_trip_through_the_token_encoding()
    {
        List<UtgardWallRecord> walls =
        [
            new(-834, 283, 1, 5, 2, false, 1),
            new(-833, 283, 0, 3, 3, true, 2),
            new(7, -2, 0, 0, 0, false, 0),
        ];

        var stored = (string)WallConverter.ConvertToProvider(walls)!;

        Assert.Equal("-834,283,1,5,2,0,1 -833,283,0,3,3,1,2 7,-2,0,0,0,0,0", stored);
        Assert.Equal(walls, (List<UtgardWallRecord>)WallConverter.ConvertFromProvider(stored)!);
    }

    [Fact]
    public void Towers_round_trip_through_the_token_encoding()
    {
        List<JotunTowerRecord> towers = [new(-12, 40, 2), new(0, 0, 5)];

        var stored = (string)TowerConverter.ConvertToProvider(towers)!;

        Assert.Equal("-12,40,2 0,0,5", stored);
        Assert.Equal(towers, (List<JotunTowerRecord>)TowerConverter.ConvertFromProvider(stored)!);
    }

    [Fact]
    public void Empty_lists_are_the_empty_string_and_back()
    {
        Assert.Equal(string.Empty, (string)WallConverter.ConvertToProvider(new List<UtgardWallRecord>())!);
        Assert.Empty((List<UtgardWallRecord>)WallConverter.ConvertFromProvider(string.Empty)!);
        Assert.Equal(string.Empty, (string)TowerConverter.ConvertToProvider(new List<JotunTowerRecord>())!);
        Assert.Empty((List<JotunTowerRecord>)TowerConverter.ConvertFromProvider(string.Empty)!);
    }

    [Fact]
    public void The_comparer_sees_a_breached_wall()
    {
        var a = new List<UtgardWallRecord> { new(1, 2, 0, 0, 0, false, 2) };
        var b = new List<UtgardWallRecord> { new(1, 2, 0, 0, 0, false, 0) };

        Assert.True(UtgardWallListConverter.Comparer.Equals(a, [.. a]));
        Assert.False(UtgardWallListConverter.Comparer.Equals(a, b));
    }
}
