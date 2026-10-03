using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;

namespace Bjarnoy.Infrastructure.Tests;

public class ApiKeyConvertersTests
{
    private static readonly ApiKeyFeaturesConverter Features = new();
    private static readonly GuidListConverter Guids = new();

    [Fact]
    public void Features_are_stored_sorted_as_feature_colon_level()
    {
        var grants = new Dictionary<string, ApiKeyAccess>
        {
            ["worlds"] = ApiKeyAccess.Read,
            ["settlements"] = ApiKeyAccess.ReadWrite,
            ["admin.users"] = ApiKeyAccess.Read,
        };

        var stored = (string)Features.ConvertToProvider(grants)!;

        Assert.Equal("admin.users:r;settlements:rw;worlds:r", stored);
        Assert.Equal(grants, (Dictionary<string, ApiKeyAccess>)Features.ConvertFromProvider(stored)!);
    }

    [Fact]
    public void Features_with_no_access_are_not_stored_and_an_empty_value_is_an_empty_map()
    {
        var stored = (string)Features.ConvertToProvider(
            new Dictionary<string, ApiKeyAccess> { ["worlds"] = ApiKeyAccess.None, ["chat"] = ApiKeyAccess.Read })!;

        Assert.Equal("chat:r", stored);
        Assert.Empty((Dictionary<string, ApiKeyAccess>)Features.ConvertFromProvider(string.Empty)!);
    }

    [Fact]
    public void Unparseable_feature_entries_are_skipped_rather_than_breaking_the_row()
    {
        var parsed = (Dictionary<string, ApiKeyAccess>)Features.ConvertFromProvider("chat:r;garbage;worlds:zz;;settlements:rw")!;

        Assert.Equal(
            new Dictionary<string, ApiKeyAccess> { ["chat"] = ApiKeyAccess.Read, ["settlements"] = ApiKeyAccess.ReadWrite },
            parsed);
    }

    [Fact]
    public void The_features_comparer_sees_in_place_edits()
    {
        var comparer = ApiKeyFeaturesConverter.Comparer;
        var original = new Dictionary<string, ApiKeyAccess> { ["worlds"] = ApiKeyAccess.Read };
        var snapshot = comparer.Snapshot(original);

        Assert.True(comparer.Equals(original, snapshot));
        original["worlds"] = ApiKeyAccess.ReadWrite;
        Assert.False(comparer.Equals(original, snapshot));
        Assert.False(comparer.Equals(original, new Dictionary<string, ApiKeyAccess> { ["chat"] = ApiKeyAccess.ReadWrite }));
    }

    [Fact]
    public void Guid_lists_round_trip_as_comma_separated_text()
    {
        List<Guid> ids = [Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7()];

        var stored = (string)Guids.ConvertToProvider(ids)!;

        Assert.Equal(string.Join(',', ids), stored);
        Assert.Equal(ids, (List<Guid>)Guids.ConvertFromProvider(stored)!);
        Assert.Empty((List<Guid>)Guids.ConvertFromProvider(string.Empty)!);
        Assert.Equal(string.Empty, (string)Guids.ConvertToProvider(new List<Guid>())!);
    }
}
