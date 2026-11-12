using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>Renaming a settlement: owner only, free, any time, names need not be unique.</summary>
public sealed class SettlementRenameEndpointsTests : IAsyncLifetime
{
    private const string OwnerId = "ulf-player";

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), seed: 21, radius: 60, cancellationToken: Ct);
        var islands = await client.GetFullIslandsAsync(world.Id, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    [Fact]
    public async Task Owner_renames_and_a_later_read_shows_the_new_name()
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);

        var response = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest("Nyhavn"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Nyhavn", (await response.ReadStrictAsync<SettlementResponse>(Ct)).Name);
        var read = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("Nyhavn", read!.Name);
    }

    [Fact]
    public async Task The_name_is_trimmed()
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);

        var response = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest("   Nyhavn \t"), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Nyhavn", (await response.ReadStrictAsync<SettlementResponse>(Ct)).Name);
    }

    [Theory]
    [InlineData("a")]
    [InlineData("      ")]
    [InlineData(" a ")]
    public async Task A_name_under_two_characters_after_trimming_is_refused(string name)
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);

        var response = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest(name), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var read = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("Bjornstad", read!.Name);
    }

    [Fact]
    public async Task A_name_over_100_characters_is_refused_and_exactly_100_is_accepted()
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);

        var tooLong = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest(new string('x', 101)), Ct);
        var longest = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest(new string('x', 100)), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.OK, longest.StatusCode);
    }

    [Fact]
    public async Task Another_player_cannot_rename()
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", "someone-else");

        var response = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest("Stolen"), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Renaming_without_an_owner_is_refused()
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var response = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest("Stolen"), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Names_need_not_be_unique_and_renaming_to_the_same_name_works()
    {
        using var client = _factory.CreateClient();
        var (_, settlement) = await FoundAsync(client);

        var same = await client.PutJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/name", new RenameSettlementRequest("Bjornstad"), Ct);

        Assert.Equal(HttpStatusCode.OK, same.StatusCode);
    }
}
