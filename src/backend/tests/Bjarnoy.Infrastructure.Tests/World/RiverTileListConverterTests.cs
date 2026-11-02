using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;

namespace Bjarnoy.Infrastructure.Tests.World;

public class RiverTileListConverterTests
{
    private static readonly RiverTileListConverter Converter = new();

    private static string ToText(List<RiverTileRecord> tiles) =>
        (string)Converter.ConvertToProvider(tiles)!;

    private static List<RiverTileRecord> FromText(string text) =>
        (List<RiverTileRecord>)Converter.ConvertFromProvider(text)!;

    [Fact]
    public void Width_round_trips()
    {
        var tiles = new List<RiverTileRecord>
        {
            new(3, -4, (int)RiverTileShape.Spring, [], 1, (int)RiverWidth.Stream),
            new(4, -5, (int)RiverTileShape.Straight, [4], 1, (int)RiverWidth.Widen),
            new(5, -6, (int)RiverTileShape.Confluence, [3, 4], 0, (int)RiverWidth.River),
            new(6, -6, (int)RiverTileShape.Mouth, [3], null, (int)RiverWidth.Widen),
        };

        Assert.Equal(tiles, FromText(ToText(tiles)));
    }

    [Fact]
    public void A_row_stored_before_streams_existed_reads_as_river_width()
    {
        // Five fields per tile: the format before the width field was appended.
        var tiles = FromText("3,-4,0,,1 4,-5,3,34,0 5,-5,4,3,");

        Assert.Equal(3, tiles.Count);
        Assert.All(tiles, t => Assert.Equal((int)RiverWidth.River, t.Width));
        Assert.Equal(new[] { 3, 4 }, tiles[1].InDirections);
        Assert.Null(tiles[2].OutDirection);
    }
}
