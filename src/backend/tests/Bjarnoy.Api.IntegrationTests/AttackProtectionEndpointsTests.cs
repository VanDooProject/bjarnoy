using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Anti-snowball size-gap protection (issue #336): the dispatch-time status endpoint and its enforcement on
/// arrival. The attacker's settlement is unclaimed (owned by the Abandoned system user, proved with
/// <c>X-Owner-Id</c>) so no JWT is needed; the target belongs to a bare real user, which is what makes it protectable.
/// </summary>
public sealed class AttackProtectionEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    /// <summary>
    /// A single, huge all-land island, as in <see cref="ShipMovementEndpointsTests"/> — settlement reads and
    /// arrival resolution run the terrain sampler against the world's own generation options.
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

    private sealed record Scenario(
        Guid WorldId, Guid IslandId, string AttackerOwnerId, Guid AttackerSettlementId, Guid TargetUserId, Guid TargetSettlementId);

    private async Task<Scenario> SeedAsync(int attackerLonghouse, int targetLonghouse, bool targetUserIsSystem = false)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);

        var targetName = $"target-{Guid.CreateVersion7():N}";
        var targetUser = new UserEntity
        {
            UserName = targetName,
            NormalizedUserName = targetName,
            PasswordHash = "unused",
            CreatedAt = _factory.Time.GetUtcNow(),
            IsSystem = targetUserIsSystem,
        };
        db.Users.Add(targetUser);

        var attackerOwnerId = $"attacker-{Guid.CreateVersion7():N}";
        var attacker = MakeSettlement(world.Id, island.Id, SystemUserIds.Abandoned, attackerOwnerId, 0, 0, attackerLonghouse);
        var target = MakeSettlement(world.Id, island.Id, targetUser.Id, $"target-{Guid.CreateVersion7():N}", 10, 0, targetLonghouse);
        db.Settlements.AddRange(attacker, target);
        await db.SaveChangesAsync(Ct);

        return new Scenario(world.Id, island.Id, attackerOwnerId, attacker.Id, targetUser.Id, target.Id);
    }

    private static SettlementEntity MakeSettlement(
        Guid worldId, Guid islandId, Guid userId, string ownerId, int centreQ, int centreR, int longhouseLevel)
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
        settlement.Buildings.Add(new PlacedBuildingEntity
        {
            SettlementId = settlement.Id,
            Q = centreQ,
            R = centreR,
            Type = BuildingType.Longhouse,
            Level = longhouseLevel,
        });
        return settlement;
    }

    private HttpClient ClientFor(Scenario scenario)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", scenario.AttackerOwnerId);
        return client;
    }

    private async Task<AttackProtectionResponse> GetProtectionAsync(Scenario scenario)
    {
        using var client = ClientFor(scenario);
        var response = await client.GetAsync(
            $"/api/v1/settlements/{scenario.AttackerSettlementId}/attack-protection/{scenario.TargetSettlementId}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadStrictAsync<AttackProtectionResponse>(Ct);
    }

    private async Task PlantBattleReportAsync(Guid attackerSettlementId, Guid defenderSettlementId, DateTimeOffset occurredAt)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.BattleReports.Add(new BattleReportEntity
        {
            OccurredAt = occurredAt,
            AttackerArmyId = Guid.CreateVersion7(),
            AttackerSettlementId = attackerSettlementId,
            DefenderSettlementId = defenderSettlementId,
            Winner = 0,
            AttackPower = 10,
            DefensePower = 5,
            Seed = 1,
        });
        await db.SaveChangesAsync(Ct);
    }

    private async Task SeedLastActiveAsync(Guid userId, DateTimeOffset lastActiveAt)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.UserActivities.Add(new UserActivityEntity { UserId = userId, LastActiveAtUtc = lastActiveAt });
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task A_target_more_than_five_longhouse_levels_below_is_protected()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 4);

        var status = await GetProtectionAsync(scenario);

        Assert.True(status.Protected);
        Assert.Equal("sizeGapProtected", status.Reason);
        Assert.Equal(10, status.AttackerLonghouseLevel);
        Assert.Equal(4, status.DefenderLonghouseLevel);
        Assert.Equal(AttackProtection.MaxLonghouseGap, status.MaxLonghouseGap);
    }

    [Fact]
    public async Task A_gap_of_exactly_five_is_allowed()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 5);

        var status = await GetProtectionAsync(scenario);

        Assert.False(status.Protected);
        Assert.Equal("withinSizeGap", status.Reason);
    }

    [Fact]
    public async Task A_system_owned_target_is_never_protected()
    {
        var scenario = await SeedAsync(attackerLonghouse: 20, targetLonghouse: 1, targetUserIsSystem: true);

        var status = await GetProtectionAsync(scenario);

        Assert.False(status.Protected);
        Assert.Equal("unownedTarget", status.Reason);
    }

    [Fact]
    public async Task Account_size_is_the_highest_longhouse_across_the_owners_settlements_in_the_world()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 1);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.Settlements.Add(MakeSettlement(
                scenario.WorldId, scenario.IslandId, scenario.TargetUserId, $"target2-{Guid.CreateVersion7():N}", 20, 0, longhouseLevel: 6));
            await db.SaveChangesAsync(Ct);
        }

        var status = await GetProtectionAsync(scenario);

        Assert.False(status.Protected);
        Assert.Equal(6, status.DefenderLonghouseLevel);
    }

    [Fact]
    public async Task A_recent_attack_by_the_target_owner_opens_revenge_until_it_expires()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 1);
        await PlantBattleReportAsync(
            scenario.TargetSettlementId, scenario.AttackerSettlementId, _factory.Time.GetUtcNow() - TimeSpan.FromHours(47));

        var open = await GetProtectionAsync(scenario);
        Assert.False(open.Protected);
        Assert.Equal("revenge", open.Reason);

        _factory.Time.Advance(TimeSpan.FromHours(2));

        var expired = await GetProtectionAsync(scenario);
        Assert.True(expired.Protected);
    }

    [Fact]
    public async Task An_attack_by_the_attacker_on_the_target_does_not_open_revenge()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 1);
        await PlantBattleReportAsync(
            scenario.AttackerSettlementId, scenario.TargetSettlementId, _factory.Time.GetUtcNow() - TimeSpan.FromHours(1));

        Assert.True((await GetProtectionAsync(scenario)).Protected);
    }

    [Fact]
    public async Task A_target_owner_idle_for_seven_days_is_not_protected()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 1);
        await SeedLastActiveAsync(scenario.TargetUserId, _factory.Time.GetUtcNow() - TimeSpan.FromDays(6));
        Assert.True((await GetProtectionAsync(scenario)).Protected);

        _factory.Time.Advance(TimeSpan.FromDays(2));

        var status = await GetProtectionAsync(scenario);
        Assert.False(status.Protected);
        Assert.Equal("inactiveTarget", status.Reason);
    }

    [Fact]
    public async Task An_unknown_or_foreign_world_target_is_a_404()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 1);
        var other = await SeedAsync(attackerLonghouse: 1, targetLonghouse: 1);
        using var client = ClientFor(scenario);

        var missing = await client.GetAsync(
            $"/api/v1/settlements/{scenario.AttackerSettlementId}/attack-protection/{Guid.CreateVersion7()}", Ct);
        var otherWorld = await client.GetAsync(
            $"/api/v1/settlements/{scenario.AttackerSettlementId}/attack-protection/{other.TargetSettlementId}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, otherWorld.StatusCode);
    }

    /// <summary>Plants an Attack army one game hour from the target at (10,0), carrying no loot yet.</summary>
    private async Task<Guid> PlantAttackArmyAsync(Scenario scenario)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var departedAt = _factory.Time.GetUtcNow();
        var army = new ArmyEntity
        {
            SettlementId = scenario.AttackerSettlementId,
            Mission = (int)ArmyMission.Attack,
            TargetSettlementId = scenario.TargetSettlementId,
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
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Axeman, Count = 50 }],
        };
        db.Armies.Add(army);
        await db.SaveChangesAsync(Ct);
        return army.Id;
    }

    /// <summary>Lets the planted army arrive (settled by reading it) and returns its row plus the target's battle reports.</summary>
    private async Task<(ArmyEntity? Army, int Reports)> ArriveAsync(Scenario scenario, Guid armyId)
    {
        _factory.Time.Advance(TimeSpan.FromHours(1.1));
        using var client = ClientFor(scenario);
        var response = await client.GetAsync($"/api/v1/armies/{armyId}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var army = await db.Armies.AsNoTracking().Include(a => a.Stacks).FirstOrDefaultAsync(a => a.Id == armyId, Ct);
        var reports = await db.BattleReports.CountAsync(r => r.DefenderSettlementId == scenario.TargetSettlementId, Ct);
        return (army, reports);
    }

    [Fact]
    public async Task An_attack_arriving_at_a_protected_target_turns_home_without_a_battle_or_loot()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 1);
        var armyId = await PlantAttackArmyAsync(scenario);

        var (army, reports) = await ArriveAsync(scenario, armyId);

        Assert.Equal(0, reports);
        Assert.NotNull(army);
        Assert.True(army!.IsReturning);
        Assert.Equal(50, army.Stacks.Single().Count);
        Assert.Equal(0, army.LootWood + army.LootStone + army.LootFood + army.LootIron);
    }

    [Fact]
    public async Task An_attack_arriving_within_the_size_gap_fights_and_writes_a_report()
    {
        var scenario = await SeedAsync(attackerLonghouse: 10, targetLonghouse: 5);
        var armyId = await PlantAttackArmyAsync(scenario);

        var (_, reports) = await ArriveAsync(scenario, armyId);

        Assert.Equal(1, reports);
    }
}
