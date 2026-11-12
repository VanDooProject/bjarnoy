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
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// An army sent from several garrison spots (<c>docs/design/garrison.md</c>, "Training, sending out, losing a spot"): one army per spot
/// walks to the join hex, and the groups standing there when the departure comes merge into one army that goes on at the pace of its
/// slowest unit; a group that is recalled or loses a fight before that leaves the gathering.
/// </summary>
public sealed class GatheringEndpointsTests : IAsyncLifetime
{
    private const string WinnerOwner = "winner-owner";

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    /// <summary>A single huge all-land island, as <c>ShipMovementEndpointsTests.LandOptions</c>.</summary>
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

    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord Tower = new(3, 0);

    private HttpClient ClientFor(string ownerId)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        return client;
    }

    private SettlementEntity MakeSettlement(Guid worldId, Guid islandId, string ownerId, Guid userId, HexCoord centre, params (BuildingType Type, HexCoord At)[] buildings)
    {
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = $"s-{Guid.CreateVersion7():N}",
            OwnerName = "Owner",
            OwnerId = ownerId,
            UserId = userId,
            CentreQ = centre.Q,
            CentreR = centre.R,
            SettledAt = _factory.Time.GetUtcNow(),
            StockFood = 500,
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

    /// <summary>A settlement of its own owner with spearmen at the longhouse and spearmen plus a catapult at a tower.</summary>
    private async Task<(Guid SettlementId, string Owner)> SetUpAsync()
    {
        var owner = $"owner-{Guid.CreateVersion7():N}";
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        var settlement = MakeSettlement(world.Id, island.Id, owner, SystemUserIds.Abandoned, Centre, (BuildingType.Tower, Tower));
        settlement.Garrison.Add(Stack(settlement, Centre, UnitType.Spearman, 6));
        settlement.Garrison.Add(Stack(settlement, Tower, UnitType.Spearman, 4));
        settlement.Garrison.Add(Stack(settlement, Tower, UnitType.Catapult, 1));
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return (settlement.Id, owner);
    }

    private static DispatchArmyRequest TwoSpotRequest() => new(
        [
            new DispatchSpotUnitsRequest(new HexPointRequest(Centre.Q, Centre.R), [new UnitCountRequest("spearman", 6)]),
            new DispatchSpotUnitsRequest(new HexPointRequest(Tower.Q, Tower.R), [new UnitCountRequest("spearman", 4), new UnitCountRequest("catapult", 1)]),
        ],
        null, new HexPointRequest(14, 0), 120);

    private async Task<ArmyResponse> DispatchAsync(HttpClient client, Guid settlementId)
    {
        var response = await client.PostJsonAsync($"/api/v1/settlements/{settlementId}/armies", TwoSpotRequest(), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ArmyResponse>(SqliteApiFixture.StrictJson, Ct))!;
    }

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> body)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await body(scope.ServiceProvider.GetRequiredService<GameDbContext>());
    }

    /// <summary>Moves the clock to <paramref name="minutes"/> past the gathering's departure.</summary>
    private void AdvanceToDeparture(ArmyResponse dispatched, double minutes = 5) =>
        _factory.Time.Advance(dispatched.GatherDepartsAt!.Value - dispatched.Movement!.DepartedAt + TimeSpan.FromMinutes(minutes));

    [Fact]
    public async Task Dispatching_from_two_spots_creates_one_army_per_spot_and_a_gathering()
    {
        var (settlementId, owner) = await SetUpAsync();
        using var client = ClientFor(owner);

        var dispatched = await DispatchAsync(client, settlementId);

        Assert.NotNull(dispatched.GatheringId);
        Assert.NotNull(dispatched.GatherHex);
        Assert.NotNull(dispatched.GatherDepartsAt);
        var (armies, gatherings) = await WithDbAsync(async db =>
            (await db.Armies.Include(a => a.Stacks).Where(a => a.SettlementId == settlementId).ToListAsync(Ct),
                await db.Gatherings.Where(g => g.SettlementId == settlementId).ToListAsync(Ct)));
        Assert.Equal(2, armies.Count);
        Assert.All(armies, a => Assert.Equal(dispatched.GatheringId, a.GatheringId));
        Assert.Equal([Centre, Tower], armies.Select(a => new HexCoord(a.HomeSpotQ, a.HomeSpotR)).OrderBy(c => c.Q));
        var gathering = Assert.Single(gatherings);
        Assert.Equal(dispatched.GatheringId, gathering.Id);
        Assert.Equal(new HexPointResponse(gathering.HexQ, gathering.HexR), dispatched.GatherHex);
        Assert.Equal(new HexCoord(14, 0), Assert.Single(gathering.Stops.TakeLast(1).Select(p => new HexCoord(p.Q, p.R))));
    }

    [Fact]
    public async Task Settling_past_the_departure_merges_the_groups_which_go_on_at_the_pace_of_the_slowest()
    {
        var (settlementId, owner) = await SetUpAsync();
        using var client = ClientFor(owner);
        var dispatched = await DispatchAsync(client, settlementId);
        var other = await WithDbAsync(db => db.Armies.Where(a => a.SettlementId == settlementId && a.Id != dispatched.Id).Select(a => a.Id).SingleAsync(Ct));
        var departs = dispatched.GatherDepartsAt!.Value;
        AdvanceToDeparture(dispatched);

        var merged = (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{dispatched.Id}", SqliteApiFixture.StrictJson, Ct))!;

        Assert.Null(merged.GatheringId);
        Assert.Equal("move", merged.Mission);
        Assert.Equal(10, merged.Stacks.Single(s => s.Unit == "spearman").Count);
        Assert.Equal(1, merged.Stacks.Single(s => s.Unit == "catapult").Count);
        Assert.Equal(UnitCatalogue.Get(UnitType.Catapult).Speed, merged.TotalSpeed);
        Assert.Equal(dispatched.GatherHex, merged.Movement!.Path[0]);
        Assert.Equal(new HexPointResponse(14, 0), merged.Movement.Path[^1]);
        Assert.Equal(departs, merged.Movement.DepartedAt);
        Assert.False(merged.Movement.IsReturning);
        var (armies, gatherings) = await WithDbAsync(async db =>
            (await db.Armies.Where(a => a.SettlementId == settlementId).Select(a => a.Id).ToListAsync(Ct), await db.Gatherings.CountAsync(Ct)));
        Assert.Equal([dispatched.Id], armies);
        Assert.DoesNotContain(other, armies);
        Assert.Equal(0, gatherings);
        Assert.Equal(
            HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/armies/{other}", Ct)).StatusCode);
    }

    [Fact]
    public async Task A_recalled_group_goes_home_alone_and_the_other_group_still_continues()
    {
        var (settlementId, owner) = await SetUpAsync();
        using var client = ClientFor(owner);
        var dispatched = await DispatchAsync(client, settlementId);
        var otherId = await WithDbAsync(db => db.Armies.Where(a => a.SettlementId == settlementId && a.Id != dispatched.Id).Select(a => a.Id).SingleAsync(Ct));
        var otherStacks = await WithDbAsync(db => db.Armies.Where(a => a.Id == otherId).SelectMany(a => a.Stacks).ToListAsync(Ct));

        var recalled = await client.PostAsync($"/api/v1/armies/{dispatched.Id}/recall", null, Ct);

        Assert.Equal(HttpStatusCode.OK, recalled.StatusCode);
        var recalledArmy = (await recalled.Content.ReadFromJsonAsync<ArmyResponse>(SqliteApiFixture.StrictJson, Ct))!;
        Assert.Null(recalledArmy.GatheringId);
        Assert.True(recalledArmy.Movement!.IsReturning);
        Assert.Equal(1, await WithDbAsync(db => db.Gatherings.CountAsync(Ct)));

        AdvanceToDeparture(dispatched);
        var continuing = (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{otherId}", SqliteApiFixture.StrictJson, Ct))!;

        Assert.Null(continuing.GatheringId);
        Assert.False(continuing.Movement!.IsReturning);
        Assert.Equal(new HexPointResponse(14, 0), continuing.Movement.Path[^1]);
        Assert.Equal(otherStacks.Sum(s => s.Count), continuing.Stacks.Sum(s => s.Count));
        Assert.Equal(0, await WithDbAsync(db => db.Gatherings.CountAsync(Ct)));
    }

    [Fact]
    public async Task Recalling_every_group_calls_the_whole_army_off_and_the_gathering_is_deleted()
    {
        var (settlementId, owner) = await SetUpAsync();
        using var client = ClientFor(owner);
        var dispatched = await DispatchAsync(client, settlementId);
        var otherId = await WithDbAsync(db => db.Armies.Where(a => a.SettlementId == settlementId && a.Id != dispatched.Id).Select(a => a.Id).SingleAsync(Ct));

        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/v1/armies/{dispatched.Id}/recall", null, Ct)).StatusCode);
        Assert.Equal(1, await WithDbAsync(db => db.Gatherings.CountAsync(Ct)));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"/api/v1/armies/{otherId}/recall", null, Ct)).StatusCode);

        Assert.Equal(0, await WithDbAsync(db => db.Gatherings.CountAsync(Ct)));
        AdvanceToDeparture(dispatched, minutes: 600);
        var settlementAfter = await client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Empty(await WithDbAsync(db => db.Armies.Where(a => a.SettlementId == settlementId).ToListAsync(Ct)));
        Assert.Equal(11, settlementAfter!.Garrison.Sum(s => s.Count));
    }

    [Fact]
    public async Task A_group_that_loses_a_fight_before_the_meeting_leaves_the_gathering_and_the_other_group_goes_on()
    {
        Guid loserArmyId, stayingArmyId, gatheringId;
        var meeting = new HexCoord(0, 0);
        var loserHome = new HexCoord(-20, 0);
        string loserOwner;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
            world.ApplyGenerationOptions(LandOptions);
            db.Worlds.Add(world);
            var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
            db.Islands.Add(island);

            // Armies of one player never fight, so the winner belongs to another one.
            loserOwner = $"loser-{Guid.CreateVersion7():N}";
            var winnerUser = new UserEntity { UserName = "winner", NormalizedUserName = "WINNER", PasswordHash = "hash" };
            db.Users.Add(winnerUser);
            var winnerSettlement = MakeSettlement(world.Id, island.Id, WinnerOwner, winnerUser.Id, new HexCoord(20, 0));
            var loserSettlement = MakeSettlement(world.Id, island.Id, loserOwner, SystemUserIds.Abandoned, loserHome);
            db.Settlements.AddRange(winnerSettlement, loserSettlement);

            var now = _factory.Time.GetUtcNow();
            var gathering = new GatheringEntity
            {
                SettlementId = loserSettlement.Id,
                HexQ = meeting.Q,
                HexR = meeting.R,
                DepartAt = now + TimeSpan.FromHours(8),
                Mission = (int)ArmyMission.Move,
                Stops = [new HexPoint(0, 5)],
                HomeSpotQ = loserHome.Q,
                HomeSpotR = loserHome.R,
            };
            db.Gatherings.Add(gathering);

            // One group walks into the winner on the meeting hex (5 spearmen against 10 axemen); the other is still far off and
            // reaches the meeting hex when the departure comes.
            var loser = MakeArmy(loserSettlement.Id, loserHome, [(2, 0), (1, 0), (0, 0)], [(0, 0), (-1, 0), (-2, 0)], 100, 5, gathering.Id, outboundHours: 2, gatherDepartAt: gathering.DepartAt);
            var staying = MakeArmy(
                loserSettlement.Id, loserHome, [(0, -8), (0, -7), (0, -6), (0, -5), (0, -4), (0, -3), (0, -2), (0, -1), (0, 0)],
                [(0, 0), (0, -1)], 100, 5, gathering.Id, outboundHours: 8, gatherDepartAt: gathering.DepartAt);
            var winner = MakeArmy(
                winnerSettlement.Id, new HexCoord(20, 0), [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (4, 0)], [(4, 0), (3, 0)], 1_000, 10, null,
                unit: UnitType.Axeman, outboundHours: 6);
            db.Armies.AddRange(winner, loser, staying);
            await db.SaveChangesAsync(Ct);

            loserArmyId = loser.Id;
            stayingArmyId = staying.Id;
            gatheringId = gathering.Id;
        }

        using var loserClient = ClientFor(loserOwner);

        // Three hours on, the groups have met on the road and the loser lost: it flees home, out of the gathering.
        _factory.Time.Advance(TimeSpan.FromHours(3));
        var fled = (await loserClient.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{loserArmyId}", SqliteApiFixture.StrictJson, Ct))!;
        Assert.Null(fled.GatheringId);
        Assert.True(fled.Movement!.IsReturning);
        Assert.Equal(1, await WithDbAsync(db => db.Gatherings.CountAsync(g => g.Id == gatheringId, Ct)));

        // The other group still gets to the meeting hex and goes on alone.
        _factory.Time.Advance(TimeSpan.FromHours(5.5));
        var goingOn = (await loserClient.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{stayingArmyId}", SqliteApiFixture.StrictJson, Ct))!;
        Assert.Null(goingOn.GatheringId);
        Assert.False(goingOn.Movement!.IsReturning);
        Assert.Equal(new HexPointResponse(meeting.Q, meeting.R), goingOn.Movement.Path[0]);
        Assert.Equal(new HexPointResponse(0, 5), goingOn.Movement.Path[^1]);
        Assert.Equal(5, goingOn.Stacks.Sum(s => s.Count));
        Assert.Equal(0, await WithDbAsync(db => db.Gatherings.CountAsync(g => g.Id == gatheringId, Ct)));
    }

    /// <summary>A planted gathering at (0,0) of a settlement far away, leaving <paramref name="departHours"/> from now, with two groups standing on the join hex.</summary>
    private async Task<(string Owner, Guid SettlementId, Guid GroupA, Guid GroupB, DateTimeOffset DepartAt)> PlantGatheringAsync(
        ArmyMission mission, bool fleet, UnitStack[] unitsA, UnitStack[] unitsB, double departHours = 4, double turnAroundHours = 4, Guid? ownerUser = null)
    {
        var owner = $"owner-{Guid.CreateVersion7():N}";
        var home = new HexCoord(-20, 0);
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        var settlement = MakeSettlement(world.Id, island.Id, owner, SystemUserIds.Abandoned, home);
        db.Settlements.Add(settlement);

        var departAt = _factory.Time.GetUtcNow() + TimeSpan.FromHours(departHours);
        var gathering = new GatheringEntity
        {
            SettlementId = settlement.Id,
            HexQ = 0,
            HexR = 0,
            DepartAt = departAt,
            IsFleet = fleet,
            Mission = (int)mission,
            Stops = [new HexPoint(0, 5)],
            HomeSpotQ = home.Q,
            HomeSpotR = home.R,
        };
        db.Gatherings.Add(gathering);

        // Both stand on the join hex; their own food would have turned them around exactly at the departure (turnAroundHours).
        ArmyEntity Group(UnitStack[] units, (int Q, int R)[] path, double hours)
        {
            var army = MakeArmy(settlement.Id, home, path, [(0, 0), (-1, 0)], 100, 1, gathering.Id, outboundHours: hours, gatherDepartAt: departAt, turnAroundHours: turnAroundHours);
            army.Stacks = [.. units.Select(u => new ArmyUnitStackEntity { UnitType = u.Type, Count = u.Count })];
            return army;
        }

        var a = Group(unitsA, [(-3, 0), (-2, 0), (-1, 0), (0, 0)], 2);
        var b = Group(unitsB, [(0, 0)], 0);
        db.Armies.AddRange(a, b);
        await db.SaveChangesAsync(Ct);
        return (owner, settlement.Id, a.Id, b.Id, departAt);
    }

    [Fact]
    public async Task A_group_whose_own_food_would_turn_it_around_exactly_at_the_departure_still_merges()
    {
        var (owner, settlementId, groupA, groupB, departAt) = await PlantGatheringAsync(
            ArmyMission.Move, fleet: false, [new UnitStack(UnitType.Spearman, 5)], [new UnitStack(UnitType.Spearman, 3)], turnAroundHours: 4);
        using var client = ClientFor(owner);
        _factory.Time.Advance(TimeSpan.FromHours(4.5));

        // The group that was on the join hex first survives; the other has joined it.
        var merged = (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{groupB}", SqliteApiFixture.StrictJson, Ct))!;

        Assert.Null(merged.GatheringId);
        Assert.False(merged.Movement!.IsReturning);
        Assert.Equal(8, merged.Stacks.Sum(s => s.Count));
        Assert.Equal(new HexPointResponse(0, 5), merged.Movement.Path[^1]);
        Assert.Equal(departAt, merged.Movement.DepartedAt);
        Assert.Equal([groupB], await WithDbAsync(db => db.Armies.Where(a => a.SettlementId == settlementId).Select(a => a.Id).ToListAsync(Ct)));
        Assert.DoesNotContain(groupA, await WithDbAsync(db => db.Armies.Select(a => a.Id).ToListAsync(Ct)));
    }

    [Fact]
    public async Task Another_army_settled_after_the_departure_finds_the_merged_army_and_not_the_stale_groups()
    {
        var (owner, settlementId, _, groupB, departAt) = await PlantGatheringAsync(
            ArmyMission.Move, fleet: false, [new UnitStack(UnitType.Spearman, 5)], [new UnitStack(UnitType.Spearman, 3)]);
        Guid hostileId;
        string hostileOwner;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var worldId = (await db.Settlements.SingleAsync(s => s.Id == settlementId, Ct)).WorldId;
            var islandId = (await db.Islands.FirstAsync(i => i.WorldId == worldId, Ct)).Id;
            hostileOwner = $"hostile-{Guid.CreateVersion7():N}";
            var settlement = MakeSettlement(worldId, islandId, hostileOwner, SystemUserIds.Abandoned, new HexCoord(30, 0));
            var hostile = MakeArmy(settlement.Id, new HexCoord(30, 0), [(30, 0), (29, 0)], [(29, 0), (30, 0)], 100, 3, null, outboundHours: 1, turnAroundHours: 100);
            db.Settlements.Add(settlement);
            db.Armies.Add(hostile);
            await db.SaveChangesAsync(Ct);
            hostileId = hostile.Id;
        }

        // Nobody touches the groups: the hostile army's own settle resolves the gathering that left in the meantime.
        _factory.Time.Advance(TimeSpan.FromHours(4.5));
        using var hostileClient = ClientFor(hostileOwner);
        Assert.Equal(HttpStatusCode.OK, (await hostileClient.GetAsync($"/api/v1/armies/{hostileId}", Ct)).StatusCode);

        var (armies, gatherings) = await WithDbAsync(async db =>
            (await db.Armies.Where(a => a.SettlementId == settlementId).ToListAsync(Ct), await db.Gatherings.CountAsync(Ct)));
        var merged = Assert.Single(armies);
        Assert.Equal(groupB, merged.Id);
        Assert.Null(merged.GatheringId);
        Assert.Equal(departAt, merged.DepartedAt);
        Assert.Equal(0, gatherings);
    }

    [Fact]
    public async Task A_founding_gathering_whose_settlers_were_recalled_sends_the_escort_home_instead_of_founding()
    {
        // Both groups are escorts: the group that carried the settlers is no longer there when the army leaves.
        var (owner, _, _, groupB, _) = await PlantGatheringAsync(
            ArmyMission.Found, fleet: false, [new UnitStack(UnitType.Spearman, 5)], [new UnitStack(UnitType.Spearman, 3)]);
        using var client = ClientFor(owner);
        _factory.Time.Advance(TimeSpan.FromHours(4.5));

        var army = (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{groupB}", SqliteApiFixture.StrictJson, Ct))!;

        Assert.True(army.Movement!.IsReturning);
        Assert.Null(army.GatheringId);
        Assert.Equal(8, army.Stacks.Sum(s => s.Count));
    }

    [Fact]
    public async Task A_camp_gathering_without_its_builders_sends_the_army_home()
    {
        var (owner, _, _, groupB, _) = await PlantGatheringAsync(
            ArmyMission.SetUpCamp, fleet: false, [new UnitStack(UnitType.Spearman, 5)], [new UnitStack(UnitType.CampBuilder, 1)]);
        using var client = ClientFor(owner);
        _factory.Time.Advance(TimeSpan.FromHours(4.5));

        var army = (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{groupB}", SqliteApiFixture.StrictJson, Ct))!;

        Assert.True(army.Movement!.IsReturning);
    }

    [Fact]
    public async Task A_meeting_of_ships_where_no_ship_stands_does_not_merge_and_every_group_goes_home()
    {
        var (owner, settlementId, groupA, groupB, _) = await PlantGatheringAsync(
            ArmyMission.Move, fleet: true, [new UnitStack(UnitType.Spearman, 5)], [new UnitStack(UnitType.Spearman, 3)]);
        using var client = ClientFor(owner);
        _factory.Time.Advance(TimeSpan.FromHours(4.5));

        var first = (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{groupA}", SqliteApiFixture.StrictJson, Ct))!;

        Assert.Null(first.GatheringId);
        Assert.True(first.Movement!.IsReturning);
        Assert.Equal(5, first.Stacks.Sum(s => s.Count));
        var second = await WithDbAsync(db => db.Armies.SingleAsync(a => a.Id == groupB, Ct));
        Assert.Null(second.GatheringId);
        Assert.Null(second.GatherDepartAt);
        Assert.Equal(0, await WithDbAsync(db => db.Gatherings.CountAsync(g => g.SettlementId == settlementId, Ct)));
    }

    private ArmyEntity MakeArmy(
        Guid settlementId, HexCoord home, (int Q, int R)[] path, (int Q, int R)[] returnPath, double provisions, int count, Guid? gatheringId,
        UnitType unit = UnitType.Spearman, double outboundHours = 0, DateTimeOffset? gatherDepartAt = null, double? turnAroundHours = null)
    {
        var departedAt = _factory.Time.GetUtcNow();
        List<double> hours = [.. path.Select((_, i) => outboundHours * i / Math.Max(1, path.Length - 1))];
        List<double> returnHours = [.. returnPath.Select((_, i) => (double)i)];
        return new ArmyEntity
        {
            SettlementId = settlementId,
            HomeSpotQ = home.Q,
            HomeSpotR = home.R,
            GatheringId = gatheringId,
            GatherDepartAt = gatheringId is null ? null : gatherDepartAt,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            Provisions = provisions,
            DepartedAt = departedAt,
            Path = [.. path.Select(p => new HexPoint(p.Q, p.R))],
            CumulativeHours = hours,
            EdgeHours = hours,
            ReturnPath = [.. returnPath.Select(p => new HexPoint(p.Q, p.R))],
            ReturnCumulativeHours = returnHours,
            ReturnEdgeHours = returnHours,
            TurnAroundAt = departedAt + TimeSpan.FromHours(turnAroundHours ?? (gatheringId is null ? outboundHours : 100)),
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = unit, Count = count }],
        };
    }
}
