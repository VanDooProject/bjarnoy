using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;

namespace Bjarnoy.Infrastructure.Tests;

public class CampListConverterTests
{
    private static readonly CampListConverter Converter = new();

    [Fact]
    public void Camps_round_trip_through_the_token_encoding()
    {
        List<CampRecord> camps =
        [
            new(-12, 40, "wolfden", 5, 2),
            new(0, 0, "bearrapids", 1, 5),
            new(300, -7, "fenrirbrood", 3, 0),
        ];

        var stored = (string)Converter.ConvertToProvider(camps)!;

        Assert.Equal("-12,40,wolfden,5,2 0,0,bearrapids,1,5 300,-7,fenrirbrood,3,0", stored);
        Assert.Equal(camps, (List<CampRecord>)Converter.ConvertFromProvider(stored)!);
    }

    [Fact]
    public void An_empty_list_is_the_empty_string_and_back()
    {
        Assert.Equal(string.Empty, (string)Converter.ConvertToProvider(new List<CampRecord>())!);
        Assert.Empty((List<CampRecord>)Converter.ConvertFromProvider(string.Empty)!);
    }

    [Fact]
    public void The_comparer_sees_a_changed_camp()
    {
        var a = new List<CampRecord> { new(1, 2, "wolfden", 1, 0) };
        var b = new List<CampRecord> { new(1, 2, "wolfden", 2, 0) };

        Assert.True(CampListConverter.Comparer.Equals(a, [.. a]));
        Assert.False(CampListConverter.Comparer.Equals(a, b));
    }
}
