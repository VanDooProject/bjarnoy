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
/// <c>docs/design/troop-movement-range.md</c> §2a: an army that cannot get home stays where it is and, when its provisions run out, the
/// whole army dies and its owner gets a starvation report. Reproduced with two planted armies that meet on a hex whose every neighbour is
/// a wall, so the loser of the fight has no way home.
/// </summary>
public sealed class ArmyStarvationEndpointsTests : IAsyncLifetime
{
    private const string WinnerOwner = "winner-owner";
    private const string LoserOwner = "loser-owner";

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

    private SettlementEntity MakeSettlement(Guid worldId, Guid islandId, string ownerId, Guid userId, int centreQ, int centreR) => new()
    {
        WorldId = worldId,
        IslandId = islandId,
        Name = $"s-{Guid.CreateVersion7():N}",
        OwnerName = "Owner",
        OwnerId = ownerId,
        UserId = userId,
        CentreQ = centreQ,
        CentreR = centreR,
        SettledAt = _factory.Time.GetUtcNow(),
        StockFood = 500,
        CapacityFood = 1000,
    };

    private ArmyEntity MakeArmy(
        Guid settlementId, HexCoord home, (int Q, int R)[] path, (int Q, int R)[] returnPath, double provisions, UnitType unit, int count)
    {
        var departedAt = _factory.Time.GetUtcNow();
        List<double> hours = [.. path.Select((_, i) => (double)i)];
        List<double> returnHours = [.. returnPath.Select((_, i) => (double)i)];
        return new ArmyEntity
        {
            SettlementId = settlementId,
            HomeSpotQ = home.Q,
            HomeSpotR = home.R,
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
            TurnAroundAt = departedAt + TimeSpan.FromHours(path.Length - 1),
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = unit, Count = count }],
        };
    }

    private HttpClient ClientOf(string owner)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        return client;
    }

    [Fact]
    public async Task A_field_battle_loser_walled_in_is_stranded_and_starves_with_its_whole_army_and_a_report()
    {
        Guid worldId, loserSettlementId, loserArmyId;
        var meeting = new HexCoord(0, 0);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
            world.ApplyGenerationOptions(LandOptions);
            db.Worlds.Add(world);
            var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
            db.Islands.Add(island);

            var winnerHome = new HexCoord(20, 0);
            var loserHome = new HexCoord(-20, 0);
            // Two different players: armies of one player never fight. The loser is anonymous, so it proves itself with its owner header.
            var winnerUser = new UserEntity { UserName = "winner", NormalizedUserName = "WINNER", PasswordHash = "hash" };
            db.Users.Add(winnerUser);
            var winnerSettlement = MakeSettlement(world.Id, island.Id, WinnerOwner, winnerUser.Id, winnerHome.Q, winnerHome.R);
            var loserSettlement = MakeSettlement(world.Id, island.Id, LoserOwner, SystemUserIds.Abandoned, loserHome.Q, loserHome.R);
            db.Settlements.AddRange(winnerSettlement, loserSettlement);

            // The winner's palisade closes the meeting hex in on every side: a ring of walls blocks all land armies.
            foreach (var hex in meeting.Neighbours())
            {
                winnerSettlement.Buildings.Add(new PlacedBuildingEntity
                {
                    SettlementId = winnerSettlement.Id, Q = hex.Q, R = hex.R, Type = BuildingType.Palisade, Level = 1,
                });
            }

            // Both cross the meeting hex around the same time; 10 axemen beat 5 spearmen.
            var winner = MakeArmy(
                winnerSettlement.Id, winnerHome, [(-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0)], [(2, 0), (3, 0), (4, 0)], 1_000, UnitType.Axeman, 10);
            var loser = MakeArmy(
                loserSettlement.Id, loserHome, [(2, 0), (1, 0), (0, 0), (-1, 0), (-2, 0)], [(-2, 0), (-3, 0), (-4, 0)], 100, UnitType.Spearman, 5);
            db.Armies.AddRange(winner, loser);
            await db.SaveChangesAsync(Ct);

            worldId = world.Id;
            loserSettlementId = loserSettlement.Id;
            loserArmyId = loser.Id;
        }

        using var loserClient = ClientOf(LoserOwner);

        // Three hours on, the armies have met and the loser lost: with every way out walled, it stays where it fought.
        _factory.Time.Advance(TimeSpan.FromHours(3));
        var stranded = await loserClient.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{loserArmyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.False(stranded!.AtHome);
        Assert.True(stranded.Movement!.IsStranded);
        Assert.False(stranded.Movement.IsReturning);
        Assert.Equal(new HexPointResponse(meeting.Q, meeting.R), stranded.Position);
        Assert.NotNull(stranded.StarvesAt);
        var survivors = stranded.Stacks.Sum(s => s.Count);
        Assert.InRange(survivors, 1, 5);

        // Still there, still hungry, shortly before its food runs out.
        _factory.Time.Advance(stranded.StarvesAt!.Value - _factory.Time.GetUtcNow() - TimeSpan.FromMinutes(10));
        var waiting = await loserClient.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{loserArmyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.True(waiting!.Movement!.IsStranded);
        Assert.Equal(stranded.StarvesAt, waiting.StarvesAt);

        // When the food is gone the whole army is gone: no army, nobody came home, and the owner has a starvation report.
        _factory.Time.Advance(TimeSpan.FromMinutes(20));
        var gone = await loserClient.GetAsync($"/api/v1/armies/{loserArmyId}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);

        var home = await loserClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{loserSettlementId}", SqliteApiFixture.StrictJson, Ct);
        Assert.DoesNotContain(home!.Garrison, s => s.Unit == "spearman");

        var reports = await loserClient.GetFromJsonAsync<List<ArmyReportResponse>>(
            $"/api/v1/worlds/{worldId}/army-reports", SqliteApiFixture.StrictJson, Ct);
        var report = Assert.Single(reports!);
        Assert.Equal("starved", report.Kind);
        Assert.Equal(loserArmyId, report.ArmyId);
        Assert.Equal(new HexPointResponse(meeting.Q, meeting.R), report.Hex);
        Assert.Equal([new ArmyReportUnitLineResponse("spearman", survivors)], report.Units);

        await using var verify = _factory.Services.CreateAsyncScope();
        var verifyDb = verify.ServiceProvider.GetRequiredService<GameDbContext>();
        Assert.False(await verifyDb.Armies.AnyAsync(a => a.Id == loserArmyId, Ct));
    }
}
