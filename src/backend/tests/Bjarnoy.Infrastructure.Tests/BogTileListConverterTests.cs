using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;

namespace Bjarnoy.Infrastructure.Tests;

public class BogTileListConverterTests
{
    private static readonly BogTileListConverter Converter = new();

    [Fact]
    public void Bog_tiles_round_trip_through_the_token_encoding()
    {
        List<BogTileRecord> tiles =
        [
            new(3, -4, 5, [0], 1, [1]),
            new(-12, 40, 0, [], null, []),
            new(0, 0, 4, [], null, [2, 3, 4]),
            new(7, 7, 7, [], 4, []),
        ];

        var stored = (string)Converter.ConvertToProvider(tiles)!;

        Assert.Equal("3,-4,5,0,1,1 -12,40,0,,, 0,0,4,,,234 7,7,7,,4,", stored);
        Assert.Equal(tiles, (List<BogTileRecord>)Converter.ConvertFromProvider(stored)!);
    }

    [Fact]
    public void An_empty_list_is_the_empty_string_and_back()
    {
        Assert.Equal(string.Empty, (string)Converter.ConvertToProvider(new List<BogTileRecord>())!);
        Assert.Empty((List<BogTileRecord>)Converter.ConvertFromProvider(string.Empty)!);
    }

    [Fact]
    public void The_comparer_sees_a_changed_tile()
    {
        var a = new List<BogTileRecord> { new(1, 2, 6, [0], 1, []) };
        var b = new List<BogTileRecord> { new(1, 2, 6, [0], 2, []) };

        Assert.True(BogTileListConverter.Comparer.Equals(a, [.. a]));
        Assert.False(BogTileListConverter.Comparer.Equals(a, b));
    }
}
