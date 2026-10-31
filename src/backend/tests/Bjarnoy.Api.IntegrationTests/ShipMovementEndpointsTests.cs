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
/// docs/design/ship-movement.md §2: a fleet's home is the last owned
/// Dockyard settlement it docked at. A plain Move whose destination hex is a
/// *different* settlement the same player owns, with a Dockyard, folds into
/// that settlement's garrison on arrival — the exact same "arrival, then
/// fold" treatment <c>ArmyService.FoldHome</c> already gives a return to
/// origin, just generalized to wherever the fleet actually lands (see
/// <c>ArmyService.FoldIntoDock</c>). Reproduces the arrival with a directly
/// planted <see cref="ArmyEntity"/> the same way <c>AdminGodModeEndpointsTests.PlantArmyAsync</c>
/// does — dispatching through the player endpoint would need an owning
/// account, a trained garrison and a reachable route, none of which is what
/// these tests are about.
/// </summary>
public sealed class ShipMovementEndpointsTests : IAsyncLifetime
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

    /// <summary>
    /// A single, huge all-land island covering the hexes these tests place
    /// settlements on — mirrors <c>FieldBattleServiceTests.LandOptions</c>.
    /// Settlement reads run <see cref="Bjarnoy.Domain.World.TerrainSampler"/>
    /// against the world's own generation options, so a bare
    /// <see cref="WorldEntity"/> (whatever <see cref="WorldGenerationOptions.Validate"/>'s
    /// defaults are) 500s on read — this is what actually needs setting.
    /// </summary>
    private static WorldGenerationOptions LandOptions => new()
    {
        // Seed 14 is one where the discs of the cells around the origin cover every
        // hex within 30 of it (WorldGeneratorTests.The_all_land_test_options_cover_the_origin
        // guards this with the same numbers; re-search a seed if the island shape changes):
        // one 100-hex-wide disc per 100-hex cell (a single-vertex spine, no islets
        // possible to matter, no warp, no coast noise, every cell an island), so the
        // ground around the origin is plain grass — no sea, sand, forest or mountain.
        Seed = 14,
        Radius = 500,
        IslandCellSize = 100,
        IslandChance = 1.0,
        IslandMaxReach = 0.0, // overlapping discs on purpose: legacy reach budget,
        IslandMinGap = 0.0, // and no min-gap rule to drop the overlapping ones
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

    /// <summary>
    /// <see cref="LandOptions"/> with 14-hex-wide islands, so the sea starts a few hexes from an island's middle. With seed 14,
    /// (-60,-38) is grass with only grass within two hexes of it (no shoreline), and (-59,-41) -> (-58,-42) -> (-58,-43) is sea.
    /// </summary>
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

    private static SettlementEntity MakeSettlement(
        Guid worldId, Guid islandId, Guid userId, string ownerId, int centreQ, int centreR, bool withDockyard = false)
    {
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = $"s-{Guid.CreateVersion7():N}",
            OwnerName = "Owner",
            OwnerId = ownerId,
            UserId = userId,
            CentreQ = centreQ,
            CentreR = centreR,
        };
        if (withDockyard)
        {
            settlement.Buildings.Add(new PlacedBuildingEntity
            {
                SettlementId = settlement.Id,
                Q = centreQ,
                R = centreR,
                Type = BuildingType.Dockyard,
                Level = 1,
            });
        }

        return settlement;
    }

    /// <summary>
    /// Plants an army mid-journey from (0,0) to (10,0), one game hour out,
    /// arriving at whichever settlement's centre sits at (10,0) — the test
    /// itself decides who owns that hex and whether it has a Dockyard.
    /// </summary>
    private async Task<Guid> PlantArrivingArmyAsync(GameDbContext db, Guid originId, UnitType unitType, int count)
    {
        var departedAt = _factory.Time.GetUtcNow();
        var army = new ArmyEntity
        {
            SettlementId = originId,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            IsSupporting = false,
            Provisions = 1_000,
            DepartedAt = departedAt,
            Path = [new HexPoint(0, 0), new HexPoint(10, 0)],
            CumulativeHours = [0, 1],
            ReturnPath = [new HexPoint(10, 0), new HexPoint(0, 0)],
            ReturnCumulativeHours = [0, 1],
            TurnAroundAt = departedAt + TimeSpan.FromHours(100),
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = unitType, Count = count }],
        };
        db.Armies.Add(army);
        await db.SaveChangesAsync(Ct);
        return army.Id;
    }

    [Fact]
    public async Task A_fleet_folds_into_a_different_owned_Dockyard_settlement_it_reaches()
    {
        using var client = Client();
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        Guid originId, destinationId, armyId;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);

            // Unclaimed (FoldIntoDock's own ownership check is OwnerId-based,
            // not UserId-based — see ArmyService.SettleTo) — that's what lets
            // this test prove ownership with the plain X-Owner-Id header
            // below, same as the rest of anonymous play.
            var origin = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, 0, 0);
            var destination = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, 10, 0, withDockyard: true);
            db.Settlements.AddRange(origin, destination);
            await db.SaveChangesAsync(Ct);
            originId = origin.Id;
            destinationId = destination.Id;

            armyId = await PlantArrivingArmyAsync(db, originId, UnitType.Karve, 3);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

        // ArmyOwnershipEndpointFilter resolves ownership from the army's
        // still-persisted row (folded, but not deleted) before the handler
        // ever runs its own "Army is null" NotFound check — so proving
        // ownership here needs the header up front too, not just for the
        // settlement reads below.
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        var armyResponse = await client.GetAsync($"/api/v1/armies/{armyId}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, armyResponse.StatusCode);

        var destinationSettlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{destinationId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(3, destinationSettlement!.Garrison.Single(s => s.Unit == "karve").Count);

        var originSettlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{originId}", SqliteApiFixture.StrictJson, Ct);
        Assert.DoesNotContain(originSettlement!.Garrison, s => s.Unit == "karve");
    }

    [Fact]
    public async Task A_fleet_attacks_a_Dockyard_settlement_it_does_not_own_instead_of_folding_or_standing()
    {
        // docs/design/ship-movement.md §2's last paragraph: a foreign dock is
        // never a free stop. Reaching one always resolves through battle,
        // the same as an explicit Attack dispatch would.
        using var client = Client();
        Guid armyId, rivalId;

        var originOwnerId = $"owner-{Guid.CreateVersion7():N}";
        var rivalOwnerId = $"rival-{Guid.CreateVersion7():N}";

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);

            // Both unclaimed (rather than one claimed via AddUser as before)
            // so this test can prove ownership of each settlement with the
            // plain X-Owner-Id header below — GetArmy/GetSettlement are both
            // owner-gated now (SettlementOwnershipEndpointFilter/
            // ArmyOwnershipEndpointFilter), and a claimed settlement's
            // ownership can only be proven by JWT, which this test has no
            // reason to set up.
            var origin = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, originOwnerId, 0, 0);
            var rival = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, rivalOwnerId, 10, 0, withDockyard: true);
            db.Settlements.AddRange(origin, rival);
            await db.SaveChangesAsync(Ct);
            rivalId = rival.Id;

            armyId = await PlantArrivingArmyAsync(db, origin.Id, UnitType.Karve, 3);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

        // Never silently absorbed into a rival's garrison — a foreign
        // Dockyard doesn't fold arrivals no matter who reaches it. Reads as
        // the rival itself (its own unclaimed owner id) purely to prove the
        // garrison state; nothing about that ownership is what this test is
        // actually about.
        client.DefaultRequestHeaders.Add("X-Owner-Id", rivalOwnerId);
        var rivalSettlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{rivalId}", SqliteApiFixture.StrictJson, Ct);
        Assert.DoesNotContain(rivalSettlement!.Garrison, s => s.Unit == "karve");

        // Redirected into an actual attack against the rival settlement (an
        // undefended one, so the fleet wins and starts its way home) rather
        // than left standing at its destination as a plain Move would. The
        // army's home settlement is origin, not rival, so this read needs
        // origin's own owner id, not rival's.
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", originOwnerId);
        var army = await client.GetFromJsonAsync<ArmyResponse>(
            $"/api/v1/armies/{armyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.NotNull(army);
        Assert.Equal("attack", army!.Mission);
        Assert.Equal(rivalId, army.TargetSettlementId);
    }

    [Fact]
    public async Task A_fleet_does_not_fold_into_an_owned_settlement_with_no_Dockyard()
    {
        using var client = Client();
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        Guid armyId;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);

            // Unclaimed (not AddUser) so the GetArmy read below can prove
            // ownership with the plain X-Owner-Id header — see the sibling
            // test's own comment on the same change.
            var origin = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, 0, 0);
            var destination = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, 10, 0, withDockyard: false);
            db.Settlements.AddRange(origin, destination);
            await db.SaveChangesAsync(Ct);

            armyId = await PlantArrivingArmyAsync(db, origin.Id, UnitType.Karve, 3);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var army = await client.GetFromJsonAsync<ArmyResponse>(
            $"/api/v1/armies/{armyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.NotNull(army);
        Assert.False(army!.AtHome);
    }

    [Fact]
    public async Task A_land_army_does_not_fold_into_a_different_owned_Dockyard_settlement()
    {
        // docs/design/ship-movement.md §2 is deliberately fleet-only — a land
        // army reaching another settlement it owns keeps standing there
        // (today's behaviour) rather than being auto-absorbed.
        using var client = Client();
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        Guid armyId;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);

            // Unclaimed (not AddUser) so the GetArmy read below can prove
            // ownership with the plain X-Owner-Id header — same reasoning as
            // this file's other two ArmyOwnershipEndpointFilter-affected tests.
            var origin = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, 0, 0);
            var destination = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, 10, 0, withDockyard: true);
            db.Settlements.AddRange(origin, destination);
            await db.SaveChangesAsync(Ct);

            armyId = await PlantArrivingArmyAsync(db, origin.Id, UnitType.Spearman, 5);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var army = await client.GetFromJsonAsync<ArmyResponse>(
            $"/api/v1/armies/{armyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.NotNull(army);
        Assert.False(army!.AtHome);
    }

    [Fact]
    public async Task A_fleet_from_an_inland_settlement_departs_from_and_is_recalled_to_its_Dockyard()
    {
        // Issue #450: the centre has no sea within two hexes, so a route from it can never start; the Dockyard on the
        // coastal sea hex inside the claim is the harbour the fleet leaves from and comes back to.
        using var client = Client();
        var ownerId = $"owner-{Guid.CreateVersion7():N}";
        var centre = new HexCoord(-60, -38);
        var dock = new HexCoord(-59, -41);
        var destination = new HexCoord(-58, -43);
        Guid settlementId;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db, SmallIslandOptions);
            var settlement = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, ownerId, centre.Q, centre.R);
            settlement.Buildings.Add(new PlacedBuildingEntity
            {
                SettlementId = settlement.Id,
                Q = dock.Q,
                R = dock.R,
                Type = BuildingType.Dockyard,
                Level = 1,
            });
            settlement.Garrison.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Karve, Count = 3 });
            settlement.StockFood = 100_000;
            settlement.CapacityFood = 100_000;
            db.Settlements.Add(settlement);
            await db.SaveChangesAsync(Ct);
            settlementId = settlement.Id;
        }

        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        var dispatched = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/armies",
            new DispatchArmyRequest(
                [new UnitCountRequest("karve", 3)], null, new HexPointRequest(destination.Q, destination.R), 30),
            Ct);
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal(new HexPointResponse(dock.Q, dock.R), army.Movement!.Path[0]);
        Assert.Equal(new HexPointResponse(dock.Q, dock.R), army.Movement.ReturnPath[^1]);

        // Half way out, so the recall has a leg to walk back (at the Dockyard itself it would fold home at once).
        _factory.Time.Advance(TimeSpan.FromHours(army.Movement.CumulativeHours[^1] * 0.5));

        var recalled = await client.PostAsync($"/api/v1/armies/{army.Id}/recall", null, Ct);
        Assert.Equal(HttpStatusCode.OK, recalled.StatusCode);
        var recall = await recalled.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.True(recall.Movement!.IsReturning);
        Assert.Equal(new HexPointResponse(dock.Q, dock.R), recall.Movement.Path[^1]);
    }

    [Fact]
    public async Task A_fleet_attack_is_sent_at_a_shore_building_of_an_inland_centred_target_and_damages_only_it()
    {
        // Issue #450, target half. The target's centre (-60,-38) has no sea within two hexes, but its claim (radius 2)
        // reaches the shoreline hex (-60,-40); the fleet must name a building there, sails to that hex, wins against the
        // empty garrison, and the siege hits that building only (3 Karves = 30 siege power -> 3 levels).
        using var client = Client();
        var attackerOwner = $"owner-{Guid.CreateVersion7():N}";
        var targetOwner = $"rival-{Guid.CreateVersion7():N}";
        var attackerCentre = new HexCoord(-58, -35);
        var dock = new HexCoord(-59, -41);
        var targetCentre = new HexCoord(-60, -38);
        var shoreBuilding = new HexCoord(-60, -40);
        var inlandBuilding = new HexCoord(-60, -37);
        Guid attackerId, targetId;

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db, SmallIslandOptions);
            var attacker = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, attackerOwner, attackerCentre.Q, attackerCentre.R);
            attacker.Buildings.Add(new PlacedBuildingEntity { SettlementId = attacker.Id, Q = dock.Q, R = dock.R, Type = BuildingType.Dockyard, Level = 1 });
            attacker.Garrison.Add(new UnitStackEntity { SettlementId = attacker.Id, UnitType = UnitType.Karve, Count = 3 });
            attacker.StockFood = 100_000;
            attacker.CapacityFood = 100_000;

            var target = MakeSettlement(worldId, islandId, SystemUserIds.Abandoned, targetOwner, targetCentre.Q, targetCentre.R);
            target.Buildings.Add(new PlacedBuildingEntity { SettlementId = target.Id, Q = shoreBuilding.Q, R = shoreBuilding.R, Type = BuildingType.Farm, Level = 5 });
            target.Buildings.Add(new PlacedBuildingEntity { SettlementId = target.Id, Q = inlandBuilding.Q, R = inlandBuilding.R, Type = BuildingType.Farm, Level = 5 });
            db.Settlements.AddRange(attacker, target);
            await db.SaveChangesAsync(Ct);
            attackerId = attacker.Id;
            targetId = target.Id;
        }

        client.DefaultRequestHeaders.Add("X-Owner-Id", attackerOwner);
        UnitCountRequest[] karves = [new UnitCountRequest("karve", 3)];
        var centre = new HexPointRequest(targetCentre.Q, targetCentre.R);

        var withoutBuilding = await client.PostJsonAsync(
            $"/api/v1/settlements/{attackerId}/armies",
            new DispatchArmyRequest(karves, null, centre, 30, "attack", targetId), Ct);
        Assert.Equal(HttpStatusCode.Conflict, withoutBuilding.StatusCode);

        var inland = await client.PostJsonAsync(
            $"/api/v1/settlements/{attackerId}/armies",
            new DispatchArmyRequest(karves, null, centre, 30, "attack", targetId, new HexPointRequest(inlandBuilding.Q, inlandBuilding.R)), Ct);
        Assert.Equal(HttpStatusCode.Conflict, inland.StatusCode);

        var dispatched = await client.PostJsonAsync(
            $"/api/v1/settlements/{attackerId}/armies",
            new DispatchArmyRequest(karves, null, centre, 30, "attack", targetId, new HexPointRequest(shoreBuilding.Q, shoreBuilding.R)), Ct);
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal(new HexPointResponse(shoreBuilding.Q, shoreBuilding.R), army.Movement!.Path[^1]);

        _factory.Time.Advance(TimeSpan.FromHours(army.Movement.CumulativeHours[^1] + 0.1));

        // Arrivals are settled when someone reads: the attacker looks at its fleet first.
        var returning = await client.GetFromJsonAsync<ArmyResponse>(
            $"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.True(returning!.Movement!.IsReturning);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", targetOwner);
        var reports = await client.GetFromJsonAsync<List<BattleReportResponse>>(
            $"/api/v1/settlements/{targetId}/reports", SqliteApiFixture.StrictJson, Ct);
        var report = Assert.Single(reports!);
        Assert.Equal("attacker", report.Winner);
        Assert.NotNull(report.Siege);
        Assert.Equal(new HexPointResponse(shoreBuilding.Q, shoreBuilding.R), report.Siege!.TargetCoord);
        Assert.Equal(5, report.Siege.LevelBefore);
        Assert.Equal(2, report.Siege.LevelAfter);

        var settlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{targetId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, settlement!.Buildings.Single(b => b.Q == shoreBuilding.Q && b.R == shoreBuilding.R).Level);
        Assert.Equal(5, settlement.Buildings.Single(b => b.Q == inlandBuilding.Q && b.R == inlandBuilding.R).Level);
    }
}
