using System.Data.Common;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Issue #341: two overlapping writes to one settlement must not lose an
/// update. Each test makes the race deterministic with a
/// <see cref="RaceInjector"/>: the moment request A has read the settlement
/// (before it saves), a competing request B is run to completion, so A's save
/// is guaranteed to be based on a stale read — exactly the interleaving that
/// used to let the last save silently win.
/// </summary>
public sealed class SettlementConcurrencyTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _baseFactory = BjarnoyApiFactory.Sqlite();
    private readonly RaceInjector _injector = new();
    private WebApplicationFactory<Program> _factory = null!;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        await _baseFactory.MigrateAsync(Ct);
        _factory = _baseFactory.WithWebHostBuilder(builder =>
            builder.ConfigureTestServices(services =>
                services.ConfigureDbContext<GameDbContext>(options => options.AddInterceptors(_injector))));
    }

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _baseFactory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private sealed record Player(
        HttpClient Client, HttpClient Admin, AuthResponse Auth, Guid WorldId, SettlementResponse Settlement,
        IReadOnlyList<AdminSettlementHexResponse> FreeGrass);

    /// <summary>
    /// A world with one settlement owned by a registered player (so the renown
    /// endpoints work), with a big stock, a garrison of spearmen and — via a
    /// separate admin client — the god-mode endpoints at hand.
    /// </summary>
    private async Task<Player> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var admin = _factory.CreateClient();
        var world = await _baseFactory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var founded = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        var auth = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        Authorize(client, auth.AccessToken);
        Authorize(admin, await CreateAdminTokenAsync(admin));

        var grant = await admin.PostJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/resources",
            new GrantResourcesRequest(Wood: 100_000, Stone: 100_000, Food: 100_000, Iron: 100_000), Ct);
        Assert.Equal(HttpStatusCode.OK, grant.StatusCode);
        var garrison = await admin.PostJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/garrison", new AdjustGarrisonRequest("spearman", 10), Ct);
        Assert.Equal(HttpStatusCode.OK, garrison.StatusCode);

        var layout = await admin.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{founded.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var freeGrass = layout!.Hexes.Where(h => !h.IsCentre && h.Building is null && h.Terrain == "grass").ToList();
        Assert.True(freeGrass.Count >= 3, "the fixture needs a few free grass hexes");

        return new Player(client, admin, auth, world.Id, founded, freeGrass);
    }

    private async Task<string> CreateAdminTokenAsync(HttpClient client)
    {
        var userName = Unique("admin");
        var registered = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _baseFactory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == registered.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        return (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    private static Task<HttpResponseMessage> QueueFarm(HttpClient client, Guid settlementId, AdminSettlementHexResponse hex) =>
        client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/builds", new QueueBuildRequest("farm", hex.Q, hex.R), Ct);

    private static Task<SettlementResponse?> GetSettlement(HttpClient client, Guid id) =>
        client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{id}", SqliteApiFixture.StrictJson, Ct);

    private async Task<ResourceLine> FarmCostAsync(HttpClient client)
    {
        var catalogue = await client.GetFromJsonAsync<List<BuildingDefinitionResponse>>(
            "/api/v1/buildings", SqliteApiFixture.StrictJson, Ct);
        return catalogue!.Single(b => b.Type == "farm" && b.Level == 1).Cost;
    }

    [Fact]
    public async Task Two_overlapping_build_orders_both_keep_their_cost_deduction()
    {
        var p = await SetUpAsync();
        var cost = await FarmCostAsync(p.Client);
        var before = (await GetSettlement(p.Client, p.Settlement.Id))!.Resources.Stock;

        HttpResponseMessage? competing = null;
        _injector.ArmOnce(async () => competing = await QueueFarm(p.Client, p.Settlement.Id, p.FreeGrass[1]));
        var first = await QueueFarm(p.Client, p.Settlement.Id, p.FreeGrass[0]);

        Assert.True(_injector.Fired > 0, "the race was never injected");
        var accepted = new[] { first, competing! }.Count(r => r.StatusCode == HttpStatusCode.Accepted);
        Assert.Equal(2, accepted);

        var after = (await GetSettlement(p.Client, p.Settlement.Id))!;
        Assert.Equal(2, after.Queue.Count);
        Assert.Equal(before.Wood - (2 * cost.Wood), after.Resources.Stock.Wood, 3);
        Assert.Equal(before.Stone - (2 * cost.Stone), after.Resources.Stock.Stone, 3);
    }

    [Fact]
    public async Task A_build_racing_an_army_dispatch_keeps_both_effects()
    {
        var p = await SetUpAsync();
        var cost = await FarmCostAsync(p.Client);
        var before = (await GetSettlement(p.Client, p.Settlement.Id))!;
        var spearmenBefore = before.Garrison.Single(g => g.Unit == "spearman").Count;
        var target = p.FreeGrass[2];

        HttpResponseMessage? competing = null;
        _injector.ArmOnce(async () => competing = await p.Client.PostJsonAsync(
            $"/api/v1/settlements/{p.Settlement.Id}/armies",
            new DispatchArmyRequest([new UnitCountRequest("spearman", 4)], null, new HexPointRequest(target.Q, target.R), 5),
            Ct));
        var build = await QueueFarm(p.Client, p.Settlement.Id, p.FreeGrass[0]);

        Assert.True(_injector.Fired > 0, "the race was never injected");
        Assert.Equal(HttpStatusCode.Accepted, build.StatusCode);
        Assert.True(competing!.IsSuccessStatusCode, await competing.Content.ReadAsStringAsync(Ct));

        var after = (await GetSettlement(p.Client, p.Settlement.Id))!;
        Assert.Single(after.Queue);
        Assert.Equal(spearmenBefore - 4, after.Garrison.Single(g => g.Unit == "spearman").Count);
        Assert.Equal(before.Resources.Stock.Wood - cost.Wood, after.Resources.Stock.Wood, 3);

        // Food is the column both requests write: the farm's price and the
        // army's provisions. A stale save would restore one of the two.
        const double Provisions = 5;
        Assert.Equal(before.Resources.Stock.Food - cost.Food - Provisions, after.Resources.Stock.Food, 3);
    }

    [Fact]
    public async Task A_finished_feast_is_credited_once_even_when_a_stale_write_races_the_renown_read()
    {
        var p = await SetUpAsync();

        var square = await p.Admin.PutJsonAsync(
            $"/api/v1/admin/settlements/{p.Settlement.Id}/buildings/{p.FreeGrass[2].Q}/{p.FreeGrass[2].R}",
            new PlaceBuildingRequest("townsquare", 3), Ct);
        Assert.True(square.IsSuccessStatusCode, await square.Content.ReadAsStringAsync(Ct));

        // The starting storage cannot hold a feast's price: raise the longhouse
        // (which lifts the capacity) and top the stock up again.
        var level = await p.Admin.PutJsonAsync(
            $"/api/v1/admin/settlements/{p.Settlement.Id}/buildings/{p.Settlement.Q}/{p.Settlement.R}/level",
            new SetBuildingLevelRequest(5), Ct);
        Assert.Equal(HttpStatusCode.OK, level.StatusCode);
        await p.Admin.PostJsonAsync(
            $"/api/v1/admin/settlements/{p.Settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 1_000_000, Stone: 1_000_000, Food: 1_000_000, Iron: 1_000_000), Ct);

        var gain = Feasts.RenownFor(3);
        var started = await p.Client.PostAsync($"/api/v1/settlements/{p.Settlement.Id}/feast", null, Ct);
        Assert.True(started.StatusCode == HttpStatusCode.Accepted, await started.Content.ReadAsStringAsync(Ct));

        var baseline = await p.Client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{p.WorldId}/renown", SqliteApiFixture.StrictJson, Ct);

        // The feast ends, and nobody has read the settlement since.
        _baseFactory.Time.Advance(TimeSpan.FromHours(13));
        var refreshed = await (await p.Client.PostJsonAsync(
            "/api/v1/auth/refresh", new RefreshRequest(p.Auth.RefreshToken), Ct)).ReadStrictAsync<AuthResponse>(Ct);
        Authorize(p.Client, refreshed.AccessToken);

        // A build write reads the settlement (feast over, renown still pending
        // on it) and, before it saves, the renown endpoint collects that
        // renown and zeroes it. The stale build must not put it back.
        _injector.ArmOnce(async () => await p.Client.GetAsync($"/api/v1/worlds/{p.WorldId}/renown", Ct));
        var build = await QueueFarm(p.Client, p.Settlement.Id, p.FreeGrass[0]);
        Assert.True(_injector.Fired > 0, "the race was never injected");
        Assert.True(build.StatusCode == HttpStatusCode.Accepted, await build.Content.ReadAsStringAsync(Ct));

        var first = await p.Client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{p.WorldId}/renown", SqliteApiFixture.StrictJson, Ct);
        var second = await p.Client.GetFromJsonAsync<RenownResponse>(
            $"/api/v1/worlds/{p.WorldId}/renown", SqliteApiFixture.StrictJson, Ct);

        // Building renown over 13 hours is small next to the feast's gain; a
        // double credit would add a second `gain`.
        Assert.InRange(first!.Total - baseline!.Total, gain, gain + (gain / 2));
        Assert.Equal(first.Total, second!.Total);
    }

    [Fact]
    public async Task A_request_that_loses_the_race_every_time_gets_a_409_instead_of_overwriting()
    {
        var p = await SetUpAsync();
        var before = (await GetSettlement(p.Client, p.Settlement.Id))!.Resources.Stock;

        // Every read of the settlement is followed by a competing write.
        _injector.ArmAlways(async () => await p.Admin.PostJsonAsync(
            $"/api/v1/admin/settlements/{p.Settlement.Id}/resources", new GrantResourcesRequest(Wood: -1), Ct));
        var response = await QueueFarm(p.Client, p.Settlement.Id, p.FreeGrass[0]);
        _injector.Disarm();

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("try again", await response.Content.ReadAsStringAsync(Ct), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(ConcurrentWriteExecutor.MaxAttempts, _injector.Fired);

        // Nothing of the refused request landed; only the competing (negative) grants did.
        // (Negative because the stock sits at storage capacity, where a positive grant changes nothing.)
        var after = (await GetSettlement(p.Client, p.Settlement.Id))!;
        Assert.Empty(after.Queue);
        Assert.Equal(before.Wood - ConcurrentWriteExecutor.MaxAttempts, after.Resources.Stock.Wood, 3);
    }

    /// <summary>
    /// Test-only <see cref="DbCommandInterceptor"/>: right after the
    /// application's own full-settlement read (the one that pulls the placed
    /// buildings along) has executed — so before the request saves — it runs a
    /// competing request to completion.
    /// </summary>
    /// <remarks>
    /// While the competing request runs, further matching reads are ignored, so
    /// it cannot trigger itself. The reader has already taken its snapshot by
    /// then, which is what makes the outer request's data provably stale.
    /// </remarks>
    private sealed class RaceInjector : DbCommandInterceptor
    {
        private Func<Task>? _competing;
        private bool _repeat;
        private bool _busy;

        public int Fired { get; private set; }

        public void ArmOnce(Func<Task> competing)
        {
            _competing = competing;
            _repeat = false;
            Fired = 0;
        }

        public void ArmAlways(Func<Task> competing)
        {
            _competing = competing;
            _repeat = true;
            Fired = 0;
        }

        public void Disarm() => _competing = null;

        public override async ValueTask<DbDataReader> ReaderExecutedAsync(
            DbCommand command,
            CommandExecutedEventData eventData,
            DbDataReader result,
            CancellationToken cancellationToken = default)
        {
            if (_competing is { } competing && !_busy && IsFullSettlementRead(command))
            {
                // Disarm first: the competing request reads settlements too.
                if (!_repeat)
                {
                    _competing = null;
                }

                _busy = true;
                try
                {
                    Fired++;
                    await competing();
                }
                finally
                {
                    _busy = false;
                }
            }

            return result;
        }

        private static bool IsFullSettlementRead(DbCommand command) =>
            command.CommandText.Contains("FROM \"settlements\"", StringComparison.Ordinal)
            && command.CommandText.Contains("\"placed_buildings\"", StringComparison.Ordinal);
    }
}
