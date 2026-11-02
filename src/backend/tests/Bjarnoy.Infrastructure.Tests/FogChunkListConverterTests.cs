using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;

namespace Bjarnoy.Infrastructure.Tests;

public class FogChunkListConverterTests
{
    private static readonly FogChunkListConverter Converter = new();

    [Fact]
    public void Chunks_round_trip_through_the_token_encoding()
    {
        List<FogChunkCoord> chunks = [new(-3, 4), new(0, 0), new(12, -1)];

        var stored = (string)Converter.ConvertToProvider(chunks)!;

        Assert.Equal("-3,4 0,0 12,-1", stored);
        Assert.Equal(chunks, (List<FogChunkCoord>)Converter.ConvertFromProvider(stored)!);
    }

    [Fact]
    public void An_empty_list_is_the_empty_string_and_back()
    {
        Assert.Equal(string.Empty, (string)Converter.ConvertToProvider(new List<FogChunkCoord>())!);
        Assert.Empty((List<FogChunkCoord>)Converter.ConvertFromProvider(string.Empty)!);
    }

    [Fact]
    public void The_comparer_sees_a_changed_chunk()
    {
        var a = new List<FogChunkCoord> { new(1, 2) };

        Assert.True(FogChunkListConverter.Comparer.Equals(a, [.. a]));
        Assert.False(FogChunkListConverter.Comparer.Equals(a, [new FogChunkCoord(1, 3)]));
    }
}
