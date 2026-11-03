using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>X-App-Build</c> lets an open tab see that the deployed frontend changed
/// (see the frontend's appUpdate module).
/// </summary>
public sealed class AppBuildHeaderTests
{
    private const string Header = "X-App-Build";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Theory]
    [InlineData("/")]
    [InlineData("/settlement")]
    [InlineData("/api/v1/info")]
    public async Task Every_response_carries_the_id_from_build_id_txt(string path)
    {
        await using var factory = BjarnoyApiFactory.Sqlite().WithBuildId("assets/index-BhkDhqzG.js\n");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri(path, UriKind.Relative), Ct);

        Assert.Equal("assets/index-BhkDhqzG.js", Assert.Single(response.Headers.GetValues(Header)));
    }

    [Fact]
    public async Task Without_build_id_txt_there_is_no_header()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/", UriKind.Relative), Ct);

        Assert.False(response.Headers.Contains(Header));
    }
}
