using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Garrisons stand at spots (<c>docs/design/garrison.md</c>): an army folds into its home spot and leaves its leftover food in
/// the stock, the units of a destroyed tower march to the nearest spot, a fleet that folds into a dock sends its land troops
/// walking, a support guest stands at the spot it joined, armies get a new home when theirs is given up, and the snapshot lists
/// every spot. Armies are planted straight into the database, like the other army tests: the arrival is what is under test.
/// </summary>
public sealed class GarrisonSpotEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    // All land around the origin (see ShipMovementEndpointsTests.LandOptions), and a variant with the sea a few hexes from the middle:
    // with seed 14, (-60,-38) is land with only land within two hexes, and (-59,-41) -> (-58,-42) -> (-58,-43) is sea.
    private static WorldGenerationOptions LandOptions => new()
    {
        Seed = 14,
        Radius = 500,
        IslandCellSize = 100,
        IslandChance = 1.0,
        IslandMaxReach = 0.0,
        IslandMinGap = 0.0,
        IslandMinWidth = 100.0,
        IslandMaxWidth = 100.0,
        IslandMinSegments = 1,
        IslandMaxSegments = 1,
        IslandCoastWarp = 0.0,
        IslandCoastNoise = 0.0,
        IslandSmallShare = 0.0,
        IslandLargeShare = 0.0,
        BeachThreshold = 1.0,
        MountainThreshold = 0.0,
        MountainRockiness = 2.0,
        ForestRockiness = 2.0,
    };

    private static WorldGenerationOptions SmallIslandOptions => LandOptions with { IslandMinWidth = 14.0, IslandMaxWidth = 14.0 };

    private async Task<(Guid WorldId, Guid IslandId)> AddWorldAsync(GameDbContext db, WorldGenerationOptions? options = null)
    {
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(options ?? LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        await db.SaveChangesAsync(Ct);
        return (world.Id, island.Id);
    }

    private SettlementEntity MakeSettlement(
        Guid worldId, Guid islandId, string ownerId, HexCoord centre, double food = 50, params (BuildingType Type, HexCoord At)[] buildings)
    {
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = $"s-{Guid.CreateVersion7():N}",
            OwnerName = "Owner",
            OwnerId = ownerId,
            UserId = SystemUserIds.Abandoned,
            CentreQ = centre.Q,
            CentreR = centre.R,
            SettledAt = _factory.Time.GetUtcNow(),
            StockFood = food,
            CapacityFood = 1000,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity { SettlementId = settlement.Id, Q = centre.Q, R = centre.R, Type = BuildingType.Longhouse, Level = 1 });
        foreach (var (type, at) in buildings)
        {
            settlement.Buildings.Add(new PlacedBuildingEntity { SettlementId = settlement.Id, Q = at.Q, R = at.R, Type = type, Level = 1 });
        }

        return settlement;
    }

    private static UnitStackEntity Stack(SettlementEntity settlement, HexCoord at, UnitType type, int count) =>
        new() { SettlementId = settlement.Id, SpotQ = at.Q, SpotR = at.R, UnitType = type, Count = count };

    /// <summary>An army on a one-hex leg ending at <paramref name="to"/>: outbound to it, or (<paramref name="returning"/>) home to it.</summary>
    private ArmyEntity PlantArmy(
        SettlementEntity home, HexCoord homeSpot, HexCoord from, HexCoord to, bool returning, double provisions, params UnitStack[] stacks)
    {
        var departedAt = _factory.Time.GetUtcNow();
        var outbound = new HexPoint(to.Q, to.R);
        var origin = new HexPoint(from.Q, from.R);
        return new ArmyEntity
        {
            SettlementId = home.Id,
            HomeSpotQ = homeSpot.Q,
            HomeSpotR = homeSpot.R,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            Provisions = provisions,
            DepartedAt = departedAt,
            Path = returning ? [origin, outbound] : [new HexPoint(homeSpot.Q, homeSpot.R), outbound],
            CumulativeHours = [0, 1],
            EdgeHours = [0, 1],
            ReturnPath = [outbound, returning ? outbound : new HexPoint(homeSpot.Q, homeSpot.R)],
            ReturnCumulativeHours = [0, 1],
            ReturnEdgeHours = [0, 1],
            TurnAroundAt = returning ? departedAt : departedAt + TimeSpan.FromHours(100),
            IsReturning = returning,
            Stacks = [.. stacks.Select(s => new ArmyUnitStackEntity { UnitType = s.Type, Count = s.Count })],
        };
    }

    private HttpClient ClientFor(string ownerId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        return client;
    }

    private static Task<SettlementResponse?> GetSettlementAsync(HttpClient client, Guid id) =>
        client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{id}", SqliteApiFixture.StrictJson, Ct);

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> body)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await body(scope.ServiceProvider.GetRequiredService<GameDbContext>());
    }

    [Fact]
    public async Task A_returning_army_folds_into_its_home_spot_and_leaves_its_leftover_food_in_the_stock()
    {
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        var centre = new HexCoord(0, 0);
        var tower = new HexCoord(3, 0);
        Guid settlementId, armyId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);
            var settlement = MakeSettlement(worldId, islandId, ownerId, centre, food: 10, (BuildingType.Tower, tower));
            var army = PlantArmy(settlement, tower, tower, centre, returning: true, provisions: 100, new UnitStack(UnitType.Spearman, 5));
            db.Settlements.Add(settlement);
            db.Armies.Add(army);
            await db.SaveChangesAsync(Ct);
            settlementId = settlement.Id;
            armyId = army.Id;
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));
        using var client = ClientFor(ownerId);
        var before = (await GetSettlementAsync(client, settlementId))!;

        var gone = await client.GetAsync($"/api/v1/armies/{armyId}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
        var after = (await GetSettlementAsync(client, settlementId))!;
        var towerSpot = after.GarrisonSpots.Single(s => s.Kind == "tower");
        Assert.Equal(new UnitStackResponse("spearman", 5), Assert.Single(towerSpot.Stacks));
        Assert.Empty(after.GarrisonSpots.Single(s => s.Kind == "longhouse").Stacks);
        var leftover = 100 - (5 * UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour * 1.0);
        // The leftover joins the stock; the clock also ticks a minute between reads, which the longhouse's own food covers.
        Assert.InRange(after.Resources.Stock.Food - before.Resources.Stock.Food, leftover - 0.001, leftover + 1);
    }

    [Fact]
    public async Task The_garrison_of_a_destroyed_tower_marches_to_the_nearest_spot_which_becomes_its_home_on_food_from_the_stock()
    {
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        var centre = new HexCoord(0, 0);
        var tower = new HexCoord(3, 0);
        Guid settlementId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);
            var settlement = MakeSettlement(worldId, islandId, ownerId, centre, food: 400, (BuildingType.Tower, tower));
            settlement.Garrison.Add(Stack(settlement, tower, UnitType.Spearman, 8));
            settlement.Garrison.Add(Stack(settlement, centre, UnitType.Spearman, 2));
            db.Settlements.Add(settlement);
            await db.SaveChangesAsync(Ct);
            settlementId = settlement.Id;
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var razed = await scope.ServiceProvider.GetRequiredService<SettlementService>().RazeBuildingAsync(settlementId, tower, Ct);
            Assert.Equal(AdminEditOutcome.Applied, razed.Outcome);
        }

        await WithDbAsync(async db =>
        {
            var stacks = await db.UnitStacks.AsNoTracking().Where(s => s.SettlementId == settlementId).ToListAsync(Ct);
            Assert.DoesNotContain(stacks, s => s.SpotQ == tower.Q && s.SpotR == tower.R);
            Assert.Equal(2, stacks.Single().Count);

            var army = await db.Armies.AsNoTracking().Include(a => a.Stacks).SingleAsync(a => a.SettlementId == settlementId, Ct);
            Assert.Equal(8, army.Stacks.Single().Count);
            Assert.Equal((centre.Q, centre.R), (army.HomeSpotQ, army.HomeSpotR));
            Assert.True(army.IsReturning);
            Assert.Equal(new HexPoint(tower.Q, tower.R), army.Path[0]);
            Assert.Equal(new HexPoint(centre.Q, centre.R), army.Path[^1]);
            Assert.InRange(army.Provisions, 0.001, 8 * UnitCatalogue.Get(UnitType.Spearman).FoodCarryCapacity);
            var settlement = await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == settlementId, Ct);
            Assert.Equal(400 - army.Provisions, settlement.StockFood, 1);
            return true;
        });
    }

    [Fact]
    public async Task An_army_out_in_the_field_gets_the_nearest_reachable_spot_as_its_home_when_its_home_spot_is_given_up()
    {
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        var centre = new HexCoord(0, 0);
        var tower = new HexCoord(3, 0);
        var far = new HexCoord(-9, 0);
        Guid settlementId, nearId, strandedId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);
            var settlement = MakeSettlement(worldId, islandId, ownerId, centre, food: 400, (BuildingType.Tower, tower), (BuildingType.Tower, far));
            var near = PlantArmy(settlement, tower, tower, new HexCoord(6, 0), returning: false, provisions: 500, new UnitStack(UnitType.Spearman, 5));
            var stranded = PlantArmy(settlement, tower, tower, new HexCoord(6, 0), returning: false, provisions: 0, new UnitStack(UnitType.Spearman, 5));
            db.Settlements.Add(settlement);
            db.Armies.AddRange(near, stranded);
            await db.SaveChangesAsync(Ct);
            settlementId = settlement.Id;
            nearId = near.Id;
            strandedId = stranded.Id;
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var armies = scope.ServiceProvider.GetRequiredService<ArmyService>();
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            await armies.RehomeArmiesAsync(settlementId, tower, _factory.Time.GetUtcNow(), Ct);
            await db.SaveChangesAsync(Ct);
        }

        await WithDbAsync(async db =>
        {
            var near = await db.Armies.AsNoTracking().SingleAsync(a => a.Id == nearId, Ct);
            Assert.Equal((centre.Q, centre.R), (near.HomeSpotQ, near.HomeSpotR)); // 3 hexes from the tower, the other tower is 12
            Assert.Equal(new HexPoint(centre.Q, centre.R), near.ReturnPath[^1]);
            Assert.Equal(new HexPoint(6, 0), near.Path[^1]); // the way out is untouched

            // No food to get anywhere: it stays homed at the tower that is no more.
            var stranded = await db.Armies.AsNoTracking().SingleAsync(a => a.Id == strandedId, Ct);
            Assert.Equal((tower.Q, tower.R), (stranded.HomeSpotQ, stranded.HomeSpotR));
            return true;
        });
    }

    [Fact]
    public async Task A_fleet_folding_into_a_dock_keeps_its_ships_there_and_its_land_troops_walk_to_the_nearest_tower_or_longhouse()
    {
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        var centre = new HexCoord(-60, -38);
        var dock = new HexCoord(-59, -41);
        Guid settlementId, fleetId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db, SmallIslandOptions);
            var settlement = MakeSettlement(worldId, islandId, ownerId, centre, food: 400, (BuildingType.Dockyard, dock));
            var fleet = PlantArmy(
                settlement, dock, new HexCoord(-58, -42), dock, returning: true, provisions: 200,
                new UnitStack(UnitType.Karve, 2), new UnitStack(UnitType.Spearman, 6));
            db.Settlements.Add(settlement);
            db.Armies.Add(fleet);
            await db.SaveChangesAsync(Ct);
            settlementId = settlement.Id;
            fleetId = fleet.Id;
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));
        using var client = ClientFor(ownerId);

        var folded = await client.GetAsync($"/api/v1/armies/{fleetId}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, folded.StatusCode);
        await WithDbAsync(async db =>
        {
            var stacks = await db.UnitStacks.AsNoTracking().Where(s => s.SettlementId == settlementId).ToListAsync(Ct);
            var ships = Assert.Single(stacks);
            Assert.Equal((UnitType.Karve, 2, dock.Q, dock.R), (ships.UnitType, ships.Count, ships.SpotQ, ships.SpotR));

            var walkers = await db.Armies.AsNoTracking().Include(a => a.Stacks).SingleAsync(a => a.SettlementId == settlementId, Ct);
            Assert.Equal(6, walkers.Stacks.Single().Count);
            Assert.Equal(UnitType.Spearman, walkers.Stacks.Single().UnitType);
            Assert.Equal((centre.Q, centre.R), (walkers.HomeSpotQ, walkers.HomeSpotR));
            Assert.True(walkers.IsReturning);
            Assert.Contains(new HexCoord(walkers.Path[0].Q, walkers.Path[0].R), dock.Neighbours()); // the land hex beside the dock
            Assert.Equal(new HexPoint(centre.Q, centre.R), walkers.Path[^1]);
            Assert.True(walkers.Provisions > 0);
            return true;
        });
    }

    [Fact]
    public async Task A_support_guest_stands_at_the_spot_it_joined_and_the_snapshot_lists_every_spot_with_its_guests()
    {
        var hostOwner = $"owner-{Guid.CreateVersion7():N}";
        var guestOwner = $"owner-{Guid.CreateVersion7():N}";
        var hostCentre = new HexCoord(12, 0);
        var hostTower = new HexCoord(15, 0);
        var hostDock = new HexCoord(18, 0);
        Guid hostId, guestHomeId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);
            var host = MakeSettlement(worldId, islandId, hostOwner, hostCentre, food: 400, (BuildingType.Tower, hostTower), (BuildingType.Dockyard, hostDock));
            var guestHome = MakeSettlement(worldId, islandId, guestOwner, new HexCoord(0, 0), food: 400);
            guestHome.Garrison.Add(Stack(guestHome, new HexCoord(0, 0), UnitType.Spearman, 5));
            db.Settlements.AddRange(host, guestHome);
            await db.SaveChangesAsync(Ct);
            hostId = host.Id;
            guestHomeId = guestHome.Id;
        }

        using var guestClient = ClientFor(guestOwner);
        var from = await guestClient.SpotOfAsync(guestHomeId, Ct);
        DispatchArmyRequest Support(HexPointRequest spot) =>
            new([new(from, [new UnitCountRequest("spearman", 5)])], null, null, 100, "support", hostId, spot);

        // A hex that is no spot, a dock (land units cannot stand there) and no spot at all are refused.
        var nowhere = await guestClient.PostJsonAsync($"/api/v1/settlements/{guestHomeId}/armies", Support(new HexPointRequest(13, 0)), Ct);
        Assert.Equal(HttpStatusCode.Conflict, nowhere.StatusCode);
        Assert.Equal("SupportSpotCannotHold", await nowhere.RejectionAsync(Ct));
        var atDock = await guestClient.PostJsonAsync($"/api/v1/settlements/{guestHomeId}/armies", Support(new HexPointRequest(hostDock.Q, hostDock.R)), Ct);
        Assert.Equal("SupportSpotCannotHold", await atDock.RejectionAsync(Ct));
        var unnamed = await guestClient.PostJsonAsync(
            $"/api/v1/settlements/{guestHomeId}/armies",
            new DispatchArmyRequest([new(from, [new UnitCountRequest("spearman", 5)])], null, null, 100, "support", hostId), Ct);
        Assert.Equal("SupportSpotRequired", await unnamed.RejectionAsync(Ct));

        var sent = await guestClient.PostJsonAsync($"/api/v1/settlements/{guestHomeId}/armies", Support(new HexPointRequest(hostTower.Q, hostTower.R)), Ct);
        Assert.Equal(HttpStatusCode.Created, sent.StatusCode);
        var army = await sent.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal(new HexPointResponse(hostTower.Q, hostTower.R), army.Movement!.Path[^1]);

        _factory.Time.Advance(TimeSpan.FromHours(army.Movement.CumulativeHours[^1] + 0.1));
        var arrived = await guestClient.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.True(arrived!.Supporting);
        Assert.Equal(new HexPointResponse(hostTower.Q, hostTower.R), arrived.Position);

        using var hostClient = ClientFor(hostOwner);
        var snapshot = (await GetSettlementAsync(hostClient, hostId))!;
        Assert.Equal(
            [("longhouse", 12, 0), ("tower", 15, 0), ("dock", 18, 0)],
            snapshot.GarrisonSpots.Select(s => (s.Kind, s.Q, s.R)));
        Assert.All(snapshot.GarrisonSpots, s => Assert.Empty(s.Stacks)); // every spot is listed, empty ones included
        Assert.Equal(new UnitStackResponse("spearman", 5), Assert.Single(snapshot.GarrisonSpots.Single(s => s.Kind == "tower").Guests));
        Assert.Empty(snapshot.GarrisonSpots.Single(s => s.Kind == "longhouse").Guests);
        Assert.Empty(snapshot.Garrison); // guests are not the settlement's own garrison
        Assert.Equal(
            [("longhouse", true, false), ("tower", true, false), ("dock", false, true)],
            snapshot.GarrisonSpots.Select(s => (s.Kind, s.HoldsLand, s.HoldsShips)));
    }

    /// <summary>A host with a tower and a guest home holding 5 spearmen at its longhouse; returns the ids and the support request builder.</summary>
    private async Task<(HttpClient Client, Guid HomeId, HexPointRequest HomeSpot, Func<IReadOnlyList<DispatchSpotUnitsRequest>, DispatchArmyRequest> Support)> SupportSetupAsync()
    {
        var hostOwner = $"owner-{Guid.CreateVersion7():N}";
        var guestOwner = $"owner-{Guid.CreateVersion7():N}";
        var hostTower = new HexCoord(15, 0);
        Guid hostId, guestHomeId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);
            var host = MakeSettlement(worldId, islandId, hostOwner, new HexCoord(12, 0), food: 400, (BuildingType.Tower, hostTower));
            var guestHome = MakeSettlement(worldId, islandId, guestOwner, new HexCoord(0, 0), food: 400);
            guestHome.Garrison.Add(Stack(guestHome, new HexCoord(0, 0), UnitType.Spearman, 5));
            db.Settlements.AddRange(host, guestHome);
            await db.SaveChangesAsync(Ct);
            hostId = host.Id;
            guestHomeId = guestHome.Id;
        }

        var client = ClientFor(guestOwner);
        var home = await client.SpotOfAsync(guestHomeId, Ct);
        return (client, guestHomeId, home, from => new DispatchArmyRequest(
            from, null, null, 100, "support", hostId, new HexPointRequest(hostTower.Q, hostTower.R)));
    }

    [Fact]
    public async Task A_dispatch_listing_units_at_a_second_hex_that_is_no_garrison_spot_is_refused_for_that_spot()
    {
        var (client, homeId, home, support) = await SupportSetupAsync();
        using var _ = client;

        // (3,0) is no spot of the home settlement: sending from several spots is allowed, every one of them must be a spot.
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{homeId}/armies",
            support([new(home, [new UnitCountRequest("spearman", 3)]), new(new HexPointRequest(3, 0), [new UnitCountRequest("spearman", 2)])]), Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("NotAGarrisonSpot", await response.RejectionAsync(Ct));
    }

    [Fact]
    public async Task The_same_spot_listed_twice_is_merged_into_one_group()
    {
        var (client, homeId, home, support) = await SupportSetupAsync();
        using var _ = client;

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{homeId}/armies",
            support([new(home, [new UnitCountRequest("spearman", 2)]), new(home, [new UnitCountRequest("spearman", 3)])]), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var army = await response.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal(5, army.Stacks.Single(u => u.Unit == "spearman").Count);
    }

    [Fact]
    public async Task An_entry_with_no_units_is_ignored_and_a_dispatch_with_no_units_at_all_is_refused()
    {
        var (client, homeId, home, support) = await SupportSetupAsync();
        using var _ = client;

        var ignored = await client.PostJsonAsync(
            $"/api/v1/settlements/{homeId}/armies",
            support([new(home, [new UnitCountRequest("spearman", 5)]), new(new HexPointRequest(3, 0), [])]), Ct);
        Assert.Equal(HttpStatusCode.Created, ignored.StatusCode);

        var none = await client.PostJsonAsync($"/api/v1/settlements/{homeId}/armies", support([new(home, [])]), Ct);
        Assert.Equal(HttpStatusCode.Conflict, none.StatusCode);
        Assert.Equal("NoUnitsRequested", await none.RejectionAsync(Ct));
    }
}
