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
        Seed = 1,
        Radius = 500,
        // Kept in step with FieldBattleServiceTests.LandOptions: the island-
        // shape retune (#210) made the reach-budget check in
        // WorldGenerationOptions.Validate scale with IslandMaxElongation/
        // IslandLobeMaxScale/IslandCoastWarp, so those are pinned to their
        // floor and IslandCellSize raised to cover the 1000-hex radius —
        // otherwise Validate throws inside every TerrainSampler the
        // settlement/army reads below build, and the reads 500.
        IslandCellSize = 250,
        IslandChance = 1.0,
        IslandMinRadius = 1000,
        IslandMaxRadius = 1000,
        IslandMaxElongation = 0.0,
        IslandLobeMinScale = 0.3,
        IslandLobeMaxScale = 0.3,
        IslandCoastWarp = 0.0,
        BeachThreshold = 1.0,
        MountainThreshold = 0.0,
        MountainRockiness = 2.0,
        ForestRockiness = 2.0,
    };

    private async Task<(Guid WorldId, Guid IslandId)> AddWorldAsync(GameDbContext db)
    {
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        await db.SaveChangesAsync(Ct);
        return (world.Id, island.Id);
    }

    private static Guid AddUser(GameDbContext db)
    {
        var user = new UserEntity
        {
            UserName = $"user-{Guid.CreateVersion7():N}",
            NormalizedUserName = $"user-{Guid.CreateVersion7():N}",
            PasswordHash = "hash",
        };
        db.Users.Add(user);
        return user.Id;
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
            var userId = AddUser(db);

            var origin = MakeSettlement(worldId, islandId, userId, ownerId, 0, 0);
            var destination = MakeSettlement(worldId, islandId, userId, ownerId, 10, 0, withDockyard: true);
            db.Settlements.AddRange(origin, destination);
            await db.SaveChangesAsync(Ct);
            originId = origin.Id;
            destinationId = destination.Id;

            armyId = await PlantArrivingArmyAsync(db, originId, UnitType.Karve, 3);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

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

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var (worldId, islandId) = await AddWorldAsync(db);

            var origin = MakeSettlement(worldId, islandId, AddUser(db), $"owner-{Guid.CreateVersion7():N}", 0, 0);
            var rival = MakeSettlement(worldId, islandId, AddUser(db), $"rival-{Guid.CreateVersion7():N}", 10, 0, withDockyard: true);
            db.Settlements.AddRange(origin, rival);
            await db.SaveChangesAsync(Ct);
            rivalId = rival.Id;

            armyId = await PlantArrivingArmyAsync(db, origin.Id, UnitType.Karve, 3);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

        // Never silently absorbed into a rival's garrison — a foreign
        // Dockyard doesn't fold arrivals no matter who reaches it.
        var rivalSettlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{rivalId}", SqliteApiFixture.StrictJson, Ct);
        Assert.DoesNotContain(rivalSettlement!.Garrison, s => s.Unit == "karve");

        // Redirected into an actual attack against the rival settlement (an
        // undefended one, so the fleet wins and starts its way home) rather
        // than left standing at its destination as a plain Move would.
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
            var userId = AddUser(db);

            var origin = MakeSettlement(worldId, islandId, userId, ownerId, 0, 0);
            var destination = MakeSettlement(worldId, islandId, userId, ownerId, 10, 0, withDockyard: false);
            db.Settlements.AddRange(origin, destination);
            await db.SaveChangesAsync(Ct);

            armyId = await PlantArrivingArmyAsync(db, origin.Id, UnitType.Karve, 3);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

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
            var userId = AddUser(db);

            var origin = MakeSettlement(worldId, islandId, userId, ownerId, 0, 0);
            var destination = MakeSettlement(worldId, islandId, userId, ownerId, 10, 0, withDockyard: true);
            db.Settlements.AddRange(origin, destination);
            await db.SaveChangesAsync(Ct);

            armyId = await PlantArrivingArmyAsync(db, origin.Id, UnitType.Spearman, 5);
        }

        _factory.Time.Advance(TimeSpan.FromHours(1.1));

        var army = await client.GetFromJsonAsync<ArmyResponse>(
            $"/api/v1/armies/{armyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.NotNull(army);
        Assert.False(army!.AtHome);
    }
}
