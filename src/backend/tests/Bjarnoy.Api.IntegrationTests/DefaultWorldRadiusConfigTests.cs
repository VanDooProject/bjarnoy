using Bjarnoy.Api.Hosting;
using Bjarnoy.Domain.World;
using Microsoft.Extensions.Configuration;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>World:DefaultRadius</c> must fail startup on a bad value rather than
/// silently falling back to a full-size world.
/// </summary>
public sealed class DefaultWorldRadiusConfigTests
{
    private static IConfiguration Config(string? value) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(value is null
                ? []
                : [new KeyValuePair<string, string?>(MigrationCommand.DefaultWorldRadiusKey, value)])
            .Build();

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void A_missing_or_empty_value_leaves_the_generator_default(string? value) =>
        Assert.Null(MigrationCommand.ReadDefaultWorldRadius(Config(value)));

    [Fact]
    public void A_valid_value_is_returned() =>
        Assert.Equal(1000, MigrationCommand.ReadDefaultWorldRadius(Config("1000")));

    [Theory]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("abc")]
    [InlineData("10.5")]
    public void An_invalid_value_fails_naming_the_key(string value)
    {
        var ex = Assert.Throws<InvalidOperationException>(
            () => MigrationCommand.ReadDefaultWorldRadius(Config(value)));

        Assert.Contains(MigrationCommand.DefaultWorldRadiusKey, ex.Message);
    }

    [Fact]
    public void A_value_above_the_maximum_radius_fails()
    {
        var tooBig = (WorldGenerationOptions.MaxRadius + 1).ToString();

        Assert.Throws<InvalidOperationException>(
            () => MigrationCommand.ReadDefaultWorldRadius(Config(tooBig)));
    }
}
