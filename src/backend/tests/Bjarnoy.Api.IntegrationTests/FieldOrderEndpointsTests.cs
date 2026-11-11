using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Field orders end to end (<c>POST /armies/{id}/orders</c>, docs/design/troop-movement-range.md section 3): an army that
/// stands in the field is sent on an Attack or a Hunt and is settled by that mission on arrival exactly like a dispatched
/// one, and a standing army can send only part of itself, leaving the rest standing on its own movement.
/// </summary>
public sealed class FieldOrderEndpointsTests : IAsyncLifetime
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

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static readonly (int Dq, int Dr)[] NeighbourOffsets = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

    private sealed record Setup(
        Guid WorldId, Guid IslandId, SettlementResponse Settlement, IReadOnlyList<HexCoord> GrassNeighbours);

    /// <summary>A founded settlement (the client carries its owner id) holding 20 axemen, and its walkable neighbour hexes.</summary>
    private async Task<Setup> SetUpAsync(HttpClient client)
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var settlement = await founded.ReadStrictAsync<SettlementResponse>(Ct);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={plot.Q - 2}&qMax={plot.Q + 2}&rMin={plot.R - 2}&rMax={plot.R + 2}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain);
        var grass = NeighbourOffsets
            .Select(o => new HexCoord(plot.Q + o.Dq, plot.R + o.Dr))
            .Where(h => terrain.TryGetValue((h.Q, h.R), out var t) && t == "grass")
            .ToList();
        Assert.True(grass.Count >= 3, "the start plot needs three walkable neighbours for these tests");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Axeman, Count = 20 });
            await db.SaveChangesAsync(Ct);
        }

        return new Setup(world.Id, island.Id, settlement, grass);
    }

    private static HexPointRequest Point(HexCoord hex) => new(hex.Q, hex.R);

    /// <summary>Dispatches <paramref name="count"/> axemen on a Move to <paramref name="to"/> and lets them arrive (standing there).</summary>
    private async Task<ArmyResponse> StandingArmyAsync(HttpClient client, Guid settlementId, HexCoord to, int count = 10)
    {
        var dispatched = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/armies",
            new DispatchArmyRequest([new UnitCountRequest("axeman", count)], await client.SpotOfAsync(settlementId, Ct), null, Point(to), count * 10),
            Ct);
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);

        _factory.Time.Advance(TimeSpan.FromHours(1));
        var arrived = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.True(_factory.Time.GetUtcNow() >= arrived!.Movement!.ArrivesAt, "the army should be standing at its destination");
        Assert.False(arrived.Movement.IsReturning);
        Assert.Equal(new HexPointResponse(to.Q, to.R), arrived.Position);
        return arrived;
    }

    private static Task<HttpResponseMessage> OrderAsync(HttpClient client, Guid armyId, FieldOrderRequest request) =>
        client.PostJsonAsync($"/api/v1/armies/{armyId}/orders", request, Ct);

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> query)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await query(db);
    }

    /// <summary>An undefended settlement of another (abandoned) owner on a walkable hex a few hexes from <paramref name="home"/>.</summary>
    private async Task<(Guid Id, HexCoord Centre)> AddRivalAsync(Setup setup, HexCoord home)
    {
        return await WithDbAsync(async db =>
        {
            var world = await db.Worlds.SingleAsync(w => w.Id == setup.WorldId, Ct);
            var sampler = await WorldTerrain.SamplerAsync(db, world, Ct);
            var centre = Enumerable.Range(-4, 9)
                .SelectMany(dr => Enumerable.Range(-4, 9).Select(dq => new HexCoord(home.Q + dq, home.R + dr)))
                .Where(h => h.DistanceTo(home) is >= 3 and <= 4 && sampler.TerrainAt(h) == Terrain.Grass)
                .First(h => HexPathfinder.FindPath(home, h, sampler.TerrainAt, true) is { Count: > 0 });

            var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
            var entity = new SettlementEntity
            {
                WorldId = setup.WorldId,
                IslandId = setup.IslandId,
                Name = Unique("rival"),
                OwnerName = "Rival",
                OwnerId = Unique("rival-owner"),
                UserId = SystemUserIds.Abandoned,
                CentreQ = centre.Q,
                CentreR = centre.R,
                FoundedAt = _factory.Time.GetUtcNow(),
            };
            entity.ApplyDomain(new Settlement
            {
                Id = entity.Id,
                Name = entity.Name,
                Centre = centre,
                Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, 1)],
                Resources = ResourcePool.Create(capacity * 0.9, production, capacity, _factory.Time.GetUtcNow()),
            });
            db.Settlements.Add(entity);
            await db.SaveChangesAsync(Ct);
            return (entity.Id, centre);
        });
    }

    [Fact]
    public async Task A_standing_army_sent_on_an_attack_fights_on_arrival_like_a_dispatched_one()
    {
        using var client = Client();
        var setup = await SetUpAsync(client);
        var standing = await StandingArmyAsync(client, setup.Settlement.Id, setup.GrassNeighbours[0]);
        var (rivalId, rivalCentre) = await AddRivalAsync(setup, setup.GrassNeighbours[0]);

        var ordered = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, null, "attack", rivalId));

        Assert.Equal(HttpStatusCode.OK, ordered.StatusCode);
        var army = await ordered.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal(standing.Id, army.Id);
        Assert.Equal("attack", army.Mission);
        Assert.Equal(rivalId, army.TargetSettlementId);
        Assert.Equal(setup.GrassNeighbours[0], new HexCoord(army.Movement!.Path[0].Q, army.Movement.Path[0].R));
        Assert.Equal(new HexPointResponse(rivalCentre.Q, rivalCentre.R), army.Movement.Path[^1]);

        Assert.Empty(await WithDbAsync(db => db.BattleReports.ToListAsync(Ct)));

        // Arrival settles by the new mission: the fight happens, reported against the army's home settlement.
        _factory.Time.Advance(TimeSpan.FromHours(6));
        await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);

        var report = Assert.Single(await WithDbAsync(db => db.BattleReports.ToListAsync(Ct)));
        Assert.Equal(army.Id, report.AttackerArmyId);
        Assert.Equal(setup.Settlement.Id, report.AttackerSettlementId);
        Assert.Equal(rivalId, report.DefenderSettlementId);
    }

    [Fact]
    public async Task An_attack_order_names_its_target_like_a_dispatch_and_refuses_what_a_dispatch_refuses()
    {
        using var client = Client();
        var setup = await SetUpAsync(client);
        var standing = await StandingArmyAsync(client, setup.Settlement.Id, setup.GrassNeighbours[0]);

        var none = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, null, "attack"));
        Assert.Equal(HttpStatusCode.Conflict, none.StatusCode);
        Assert.Equal("TargetSettlementRequired", await none.RejectionAsync(Ct));

        var own = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, null, "attack", setup.Settlement.Id));
        Assert.Equal("CannotAttackOwnSettlement", await own.RejectionAsync(Ct));

        var missing = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, null, "attack", Guid.NewGuid()));
        Assert.Equal(HttpStatusCode.Conflict, missing.StatusCode);
        Assert.Equal("TargetSettlementNotFound", await missing.RejectionAsync(Ct));

        var found = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, Point(setup.GrassNeighbours[1]), "found"));
        Assert.Equal("MissionNotAllowed", await found.RejectionAsync(Ct));

        var unknown = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, null, "conquer"));
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);

        var noDestination = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, null));
        Assert.Equal("DestinationRequired", await noDestination.RejectionAsync(Ct));
    }

    [Fact]
    public async Task A_standing_army_sent_on_a_hunt_fights_the_camp_on_arrival()
    {
        using var client = Client();
        var setup = await SetUpAsync(client);
        var campHex = setup.GrassNeighbours[1];
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var island = await db.Islands.SingleAsync(i => i.Id == setup.IslandId, Ct);
            island.Camps = [new CampRecord(campHex.Q, campHex.R, CampFamilies.Harewarren, 1, 0)];
            await db.SaveChangesAsync(Ct);
        }

        var standing = await StandingArmyAsync(client, setup.Settlement.Id, setup.GrassNeighbours[0]);

        var empty = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, Point(setup.GrassNeighbours[2]), "hunt"));
        Assert.Equal(HttpStatusCode.Conflict, empty.StatusCode);
        Assert.Equal("NoCampAtDestination", await empty.RejectionAsync(Ct));

        var ordered = await OrderAsync(client, standing.Id, new FieldOrderRequest(null, Point(campHex), "hunt"));
        Assert.Equal(HttpStatusCode.OK, ordered.StatusCode);
        var army = await ordered.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal("hunt", army.Mission);

        // Arrival fights the camp, then the survivors walk home (the row is folded away again).
        _factory.Time.Advance(TimeSpan.FromHours(4));
        var read = await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);

        var reports = await client.GetFromJsonAsync<List<CampReportResponse>>(
            $"/api/v1/settlements/{setup.Settlement.Id}/camp-reports", SqliteApiFixture.StrictJson, Ct);
        var report = Assert.Single(reports!);
        Assert.Equal("hunt", report.Kind);
        Assert.Equal(army.Id, report.ArmyId);
        Assert.Equal((campHex.Q, campHex.R), (report.Camp.Q, report.Camp.R));
    }

    [Fact]
    public async Task Sending_part_of_a_standing_army_creates_a_second_army_and_leaves_the_rest_standing()
    {
        using var client = Client();
        var setup = await SetUpAsync(client);
        var standing = await StandingArmyAsync(client, setup.Settlement.Id, setup.GrassNeighbours[0], count: 10);
        var before = standing.Movement!;
        var foodBefore = standing.Provisions;

        var ordered = await OrderAsync(client, standing.Id, new FieldOrderRequest(
            null, Point(setup.GrassNeighbours[1]), Units: [new UnitCountRequest("axeman", 4)]));

        Assert.Equal(HttpStatusCode.OK, ordered.StatusCode);
        var left = await ordered.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.NotEqual(standing.Id, left.Id);
        Assert.Equal(setup.Settlement.Id, left.SettlementId);
        Assert.Equal("move", left.Mission);
        Assert.Equal(new ArmyUnitStackResponse("axeman", 4), Assert.Single(left.Stacks));
        Assert.Equal(setup.GrassNeighbours[0], new HexCoord(left.Movement!.Path[0].Q, left.Movement.Path[0].R));
        Assert.Equal(setup.GrassNeighbours[1], new HexCoord(left.Movement.Path[^1].Q, left.Movement.Path[^1].R));

        // Two army rows for the settlement; the one that stayed is untouched but for its smaller size and share of the food.
        var armies = await WithDbAsync(db => db.Armies.Include(a => a.Stacks).Where(a => a.SettlementId == setup.Settlement.Id).ToListAsync(Ct));
        Assert.Equal(2, armies.Count);

        var remainder = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{standing.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(new ArmyUnitStackResponse("axeman", 6), Assert.Single(remainder!.Stacks));
        Assert.False(remainder.Movement!.IsReturning);
        Assert.False(remainder.AtHome);
        Assert.Equal(before.Path, remainder.Movement.Path);
        Assert.Equal(before.DepartedAt, remainder.Movement.DepartedAt);
        Assert.True(
            Math.Abs((before.TurnAroundAt - remainder.Movement.TurnAroundAt).TotalMilliseconds) < 1,
            "the part that stays turns around exactly when the whole army would have");
        Assert.Equal(foodBefore, left.Provisions + remainder.Provisions, precision: 6);
        Assert.Equal(foodBefore * 0.4, left.Provisions, precision: 6);
    }

    [Fact]
    public async Task Splitting_is_refused_for_a_marching_army_and_for_an_unavailable_selection()
    {
        using var client = Client();
        var setup = await SetUpAsync(client);

        // Still marching (not yet arrived): the whole army only.
        var dispatched = await client.PostJsonAsync(
            $"/api/v1/settlements/{setup.Settlement.Id}/armies",
            new DispatchArmyRequest([new UnitCountRequest("axeman", 10)], setup.Settlement.Spot(), null, Point(setup.GrassNeighbours[0]), 100),
            Ct);
        var marching = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);
        var tooEarly = await OrderAsync(client, marching.Id, new FieldOrderRequest(
            null, Point(setup.GrassNeighbours[1]), Units: [new UnitCountRequest("axeman", 4)]));
        Assert.Equal(HttpStatusCode.Conflict, tooEarly.StatusCode);
        Assert.Equal("SplitRequiresStandingArmy", await tooEarly.RejectionAsync(Ct));

        _factory.Time.Advance(TimeSpan.FromHours(1));
        await client.GetAsync($"/api/v1/armies/{marching.Id}", Ct);

        var tooMany = await OrderAsync(client, marching.Id, new FieldOrderRequest(
            null, Point(setup.GrassNeighbours[1]), Units: [new UnitCountRequest("axeman", 11)]));
        Assert.Equal("InvalidUnitSelection", await tooMany.RejectionAsync(Ct));

        var notInArmy = await OrderAsync(client, marching.Id, new FieldOrderRequest(
            null, Point(setup.GrassNeighbours[1]), Units: [new UnitCountRequest("spearman", 1)]));
        Assert.Equal("InvalidUnitSelection", await notInArmy.RejectionAsync(Ct));

        var nothing = await OrderAsync(client, marching.Id, new FieldOrderRequest(
            null, Point(setup.GrassNeighbours[1]), Units: []));
        Assert.Equal("InvalidUnitSelection", await nothing.RejectionAsync(Ct));

        // Refused orders changed nothing.
        Assert.Single(await WithDbAsync(db => db.Armies.Where(a => a.SettlementId == setup.Settlement.Id).ToListAsync(Ct)));
    }
}
