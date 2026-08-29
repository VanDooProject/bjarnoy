using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The trade board end to end: through HTTP, the EF model and a real
/// database, with the clock under the test's control — same shape as
/// <see cref="SettlementEndpointsTests"/>.
/// </summary>
public sealed class TradeEndpointsTests : IAsyncLifetime
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

    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAsync(
        HttpClient client, int seed = 21, int radius = 60)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), seed, radius), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, Unique("v"), "Ulf", Unique("owner")),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    /// <summary>
    /// Founds a second settlement in the same world and relocates it one hex
    /// from <paramref name="near"/> — a direct DB write, since the founding
    /// API can only place a settlement on the world generator's own start
    /// positions, which land wherever the generator put them rather than
    /// somewhere a test can rely on being in trade range.
    /// </summary>
    private async Task<SettlementResponse> FoundAdjacentAsync(HttpClient client, Guid worldId, SettlementResponse near)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 1);
        var plot = island.StartPositions.First(p => p.Q != near.Q || p.R != near.R);

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, Unique("v"), "Bera", Unique("owner")),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var settlement = await response.ReadStrictAsync<SettlementResponse>(Ct);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var entity = await db.Settlements.FirstAsync(s => s.Id == settlement.Id, Ct);
        entity.CentreQ = near.Q + 1;
        entity.CentreR = near.R;
        await db.SaveChangesAsync(Ct);

        return settlement with { Q = entity.CentreQ, R = entity.CentreR };
    }

    private Task<List<TradeOfferEntitySnapshot>> ReadOffersAsync(Guid settlementId) => WithDbAsync(db =>
        db.TradeOffers.AsNoTracking()
            .Where(o => o.PosterSettlementId == settlementId)
            .Select(o => new TradeOfferEntitySnapshot(o.Id, o.State.ToString()))
            .ToListAsync(Ct));

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> query)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await query(db);
    }

    private sealed record TradeOfferEntitySnapshot(Guid Id, string State);

    [Fact]
    public async Task Posting_an_offer_escrows_the_offered_goods_and_returns_it_open()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var before = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: false),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var offer = await response.ReadStrictAsync<TradeOfferResponse>(Ct);

        Assert.Equal("open", offer.State);
        Assert.Equal(settlement.Id, offer.PosterSettlementId);
        Assert.Equal("wood", offer.OfferedResource);
        Assert.Equal(200, offer.OfferedAmount);

        var after = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.True(after!.Resources.Stock.Wood <= before!.Resources.Stock.Wood - 200 + 1);
    }

    [Fact]
    public async Task Posting_beyond_the_ratio_is_refused_and_nothing_is_spent()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var before = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 500, "iron", 100, GuildOnly: false),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("RatioExceeded", await response.RejectionAsync(Ct));

        var after = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(before!.Resources.Stock.Wood, after!.Resources.Stock.Wood, 4);
    }

    [Fact]
    public async Task An_unknown_resource_name_is_a_bad_request()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/trade-offers",
            new PostTradeOfferRequest("gold", 100, "iron", 100, GuildOnly: false),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Cancelling_an_open_offer_refunds_the_escrow()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var before = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        var posted = await (await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: false),
            Ct)).ReadStrictAsync<TradeOfferResponse>(Ct);

        var response = await client.PostJsonAsync(
            $"/api/v1/trade-offers/{posted.Id}/cancel",
            new CancelTradeOfferRequest(settlement.Id),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = await response.ReadStrictAsync<TradeOfferResponse>(Ct);
        Assert.Equal("cancelled", cancelled.State);

        var after = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(before!.Resources.Stock.Wood, after!.Resources.Stock.Wood, 4);
    }

    [Fact]
    public async Task Cancelling_someone_elses_offer_is_refused()
    {
        using var client = Client();
        var (worldId, poster) = await FoundAsync(client);
        var stranger = await FoundAdjacentAsync(client, worldId, poster);

        var posted = await (await client.PostJsonAsync(
            $"/api/v1/settlements/{poster.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: false),
            Ct)).ReadStrictAsync<TradeOfferResponse>(Ct);

        var response = await client.PostJsonAsync(
            $"/api/v1/trade-offers/{posted.Id}/cancel",
            new CancelTradeOfferRequest(stranger.Id),
            Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_board_excludes_the_posters_own_offer()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: false),
            Ct);

        var board = await client.GetFromJsonAsync<List<TradeOfferResponse>>(
            $"/api/v1/settlements/{settlement.Id}/trade-offers/board", SqliteApiFixture.StrictJson, Ct);

        Assert.Empty(board!);

        var mine = await client.GetFromJsonAsync<List<TradeOfferResponse>>(
            $"/api/v1/settlements/{settlement.Id}/trade-offers/mine", SqliteApiFixture.StrictJson, Ct);
        Assert.Single(mine!);
    }

    [Fact]
    public async Task Accepting_a_nonexistent_offer_is_not_found()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var response = await client.PostJsonAsync(
            $"/api/v1/trade-offers/{Guid.CreateVersion7()}/accept",
            new AcceptTradeOfferRequest(settlement.Id),
            Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_settlement_cannot_accept_its_own_offer()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var posted = await (await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: false),
            Ct)).ReadStrictAsync<TradeOfferResponse>(Ct);

        var response = await client.PostJsonAsync(
            $"/api/v1/trade-offers/{posted.Id}/accept",
            new AcceptTradeOfferRequest(settlement.Id),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("OwnOffer", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task A_guild_only_offer_cannot_be_accepted_yet()
    {
        // No Guild domain exists in this codebase yet (see TradeService's
        // remarks) — accepting a GuildOnly offer is always refused until
        // real membership resolution replaces the hardcoded false.
        using var client = Client();
        var (worldId, poster) = await FoundAsync(client);
        var acceptor = await FoundAdjacentAsync(client, worldId, poster);

        var posted = await (await client.PostJsonAsync(
            $"/api/v1/settlements/{poster.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: true),
            Ct)).ReadStrictAsync<TradeOfferResponse>(Ct);

        var response = await client.PostJsonAsync(
            $"/api/v1/trade-offers/{posted.Id}/accept",
            new AcceptTradeOfferRequest(acceptor.Id),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("GuildOnlyOffer", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task Accepting_dispatches_two_shipments_and_delivery_completes_the_trade()
    {
        using var client = Client();
        var (worldId, poster) = await FoundAsync(client);
        var acceptor = await FoundAdjacentAsync(client, worldId, poster);

        var posterBefore = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{poster.Id}", SqliteApiFixture.StrictJson, Ct);
        var acceptorBefore = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{acceptor.Id}", SqliteApiFixture.StrictJson, Ct);

        var posted = await (await client.PostJsonAsync(
            $"/api/v1/settlements/{poster.Id}/trade-offers",
            new PostTradeOfferRequest("wood", 200, "iron", 100, GuildOnly: false),
            Ct)).ReadStrictAsync<TradeOfferResponse>(Ct);

        var board = await client.GetFromJsonAsync<List<TradeOfferResponse>>(
            $"/api/v1/settlements/{acceptor.Id}/trade-offers/board", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(board!, o => o.Id == posted.Id);

        var acceptResponse = await client.PostJsonAsync(
            $"/api/v1/trade-offers/{posted.Id}/accept",
            new AcceptTradeOfferRequest(acceptor.Id),
            Ct);
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);
        var accepted = await acceptResponse.ReadStrictAsync<TradeAcceptResponse>(Ct);

        Assert.Equal("accepted", accepted.Offer.State);
        Assert.Equal("wood", accepted.ToAcceptor.CargoResource);
        Assert.Equal(200, accepted.ToAcceptor.CargoAmount);
        Assert.Equal("iron", accepted.ToPoster.CargoResource);
        Assert.Equal(100, accepted.ToPoster.CargoAmount);
        Assert.False(accepted.ToAcceptor.Delivered);

        // Adjacent settlements at the cart's 6 hex/h speed arrive in well
        // under a game-hour; two hours is a generous margin.
        _factory.Time.Advance(TimeSpan.FromHours(2));

        var acceptorShipments = await client.GetFromJsonAsync<List<ShipmentResponse>>(
            $"/api/v1/settlements/{acceptor.Id}/shipments", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(acceptorShipments!, s => s.Id == accepted.ToAcceptor.Id && s.Delivered);

        var posterShipments = await client.GetFromJsonAsync<List<ShipmentResponse>>(
            $"/api/v1/settlements/{poster.Id}/shipments", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(posterShipments!, s => s.Id == accepted.ToPoster.Id && s.Delivered);

        var acceptorAfter = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{acceptor.Id}", SqliteApiFixture.StrictJson, Ct);
        var posterAfter = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{poster.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.True(acceptorAfter!.Resources.Stock.Wood >= acceptorBefore!.Resources.Stock.Wood + 199);
        Assert.True(posterAfter!.Resources.Stock.Iron >= posterBefore!.Resources.Stock.Iron + 99);

        var offerState = (await ReadOffersAsync(poster.Id)).Single(o => o.Id == posted.Id).State;
        Assert.Equal("Delivered", offerState);

        var reportCount = await WithDbAsync(db => db.TradeReports.CountAsync(r => r.OfferId == posted.Id, Ct));
        Assert.Equal(1, reportCount);
    }
}
