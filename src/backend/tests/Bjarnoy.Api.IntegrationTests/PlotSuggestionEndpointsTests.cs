using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

public sealed class PlotSuggestionEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private async Task<Guid> CreateWorldAsync(HttpClient client, int seed = 21, int radius = 60)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), seed, radius), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);
        return world.Id;
    }

    [Fact]
    public async Task Missing_owner_id_header_is_rejected()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Unknown_world_is_rejected()
    {
        using var client = Client();
        client.DefaultRequestHeaders.Add("X-Owner-Id", "owner-1");

        var response = await client.GetAsync($"/api/v1/worlds/{Guid.NewGuid()}/plot-suggestion", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Returns_a_plot_and_pins_it_across_repeated_requests()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        client.DefaultRequestHeaders.Add("X-Owner-Id", "owner-1");

        var first = await (await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct))
            .ReadStrictAsync<PlotSuggestionResponse>(Ct);
        var second = await (await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct))
            .ReadStrictAsync<PlotSuggestionResponse>(Ct);

        Assert.Equal(first.Plot, second.Plot);
        Assert.Equal(first.IslandId, second.IslandId);
        Assert.True(first.Reserved);
        Assert.NotNull(first.ReservedUntil);
    }

    [Fact]
    public async Task An_owner_who_already_founded_gets_a_conflict_naming_their_settlement()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        client.DefaultRequestHeaders.Add("X-Owner-Id", "owner-1");

        var suggestion = await (await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct))
            .ReadStrictAsync<PlotSuggestionResponse>(Ct);

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(suggestion.IslandId, suggestion.Plot.Q, suggestion.Plot.R, "Bjornstad", "Ulf", "owner-1"),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);

        var response = await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("AlreadyFounded", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task Delete_releases_the_reservation_without_error()
    {
        using var client = Client();
        var worldId = await CreateWorldAsync(client);
        client.DefaultRequestHeaders.Add("X-Owner-Id", "owner-1");
        await client.GetAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct);

        var response = await client.DeleteAsync($"/api/v1/worlds/{worldId}/plot-suggestion", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
}
