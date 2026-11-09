using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>GET /worlds/{id}/foreign-armies</c> (<c>docs/design/map-fog-v2.md</c> §1g): other players' marching armies inside the caller's
/// sight, each with only the short stretch of its route ahead — nothing of their mission, target or units.
/// </summary>
public sealed class ForeignArmyEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private sealed record Scene(Guid WorldId, SettlementResponse Viewer, string ViewerOwnerId, Guid RivalSettlementId, Guid RivalArmyId, Guid ViewerArmyId);

    /// <summary>
    /// A viewer settlement and a rival one far away; the rival's army marches west to east along the viewer's row, one hex per hour
    /// (hex centres on whole hours, edges on the half hour), <paramref name="elapsedHours"/> into its leg. The viewer has an army of their own
    /// on a leg of their own.
    /// </summary>
    private async Task<Scene> SceneAsync(double elapsedHours, bool viewerArmyBesideRival = false)
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var viewerOwnerId = Unique("viewer");
        var viewer = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", viewerOwnerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var rival = new SettlementEntity
        {
            WorldId = world.Id,
            IslandId = island.Id,
            UserId = SystemUserIds.Abandoned,
            Name = Unique("rival"),
            OwnerName = "Rival",
            OwnerId = Unique("rival-owner"),
            CentreQ = viewer.Q + 40,
            CentreR = viewer.R,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = viewer.Q + 40, R = viewer.R, Type = BuildingType.Longhouse, Level = 1 }],
        };
        db.Settlements.Add(rival);

        // Nine hexes from 7 east of the viewer to 1 west of it; the viewer's visible ring is 3 hexes at level 1.
        var path = Enumerable.Range(0, 9).Select(i => new HexPoint(viewer.Q + 7 - i, viewer.R)).ToList();
        var rivalArmy = Army(rival.Id, path, elapsedHours, ArmyMission.Attack, viewer.Id);
        // The viewer's army marches west of the settlement, far from the rival's route, unless it is asked to walk beside the rival.
        var viewerPath = viewerArmyBesideRival
            ? path
            : [.. Enumerable.Range(0, 9).Select(i => new HexPoint(viewer.Q - 9 + i, viewer.R))];
        var viewerArmy = Army(viewer.Id, viewerPath, elapsedHours, ArmyMission.Move, null);
        db.Armies.AddRange(rivalArmy, viewerArmy);
        await db.SaveChangesAsync(Ct);

        return new Scene(world.Id, viewer, viewerOwnerId, rival.Id, rivalArmy.Id, viewerArmy.Id);
    }

    private ArmyEntity Army(Guid settlementId, List<HexPoint> path, double elapsedHours, ArmyMission mission, Guid? target)
    {
        var id = Guid.CreateVersion7();
        return new ArmyEntity
        {
            Id = id,
            SettlementId = settlementId,
            Mission = (int)mission,
            TargetSettlementId = target,
            AtHome = false,
            Provisions = 100,
            Stacks = [new ArmyUnitStackEntity { ArmyId = id, UnitType = UnitType.Spearman, Count = 7 }],
            DepartedAt = _factory.Time.GetUtcNow() - TimeSpan.FromHours(elapsedHours),
            Path = path,
            CumulativeHours = [.. Enumerable.Range(0, path.Count).Select(i => (double)i)],
            EdgeHours = [.. Enumerable.Range(0, path.Count).Select(i => i == 0 ? 0 : i - 0.5)],
            ReturnPath = [.. path.AsEnumerable().Reverse()],
            ReturnCumulativeHours = [.. Enumerable.Range(0, path.Count).Select(i => (double)i)],
            ReturnEdgeHours = [.. Enumerable.Range(0, path.Count).Select(i => i == 0 ? 0 : i - 0.5)],
            TurnAroundAt = _factory.Time.GetUtcNow() + TimeSpan.FromHours(100),
        };
    }

    private async Task<(string Json, List<ForeignArmyResponse> Armies)> GetAsync(Scene scene)
    {
        using var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", scene.ViewerOwnerId);
        var raw = await client.GetStringAsync($"/api/v1/worlds/{scene.WorldId}/foreign-armies", Ct);
        var armies = await client.GetFromJsonAsync<List<ForeignArmyResponse>>(
            $"/api/v1/worlds/{scene.WorldId}/foreign-armies", SqliteApiFixture.StrictJson, Ct);
        return (raw, armies!);
    }

    [Fact]
    public async Task A_foreign_army_in_sight_is_returned_with_only_the_stretch_ahead_of_it()
    {
        // 4.2 h: stands on the fifth hex (3 east of the viewer, inside the 3-hex ring), the leg it is on starts there.
        var scene = await SceneAsync(4.2);

        var (_, armies) = await GetAsync(scene);

        var army = Assert.Single(armies);
        Assert.Equal(scene.RivalArmyId, army.Id);
        Assert.Equal(scene.RivalSettlementId, army.SettlementId);
        Assert.False(army.IsFleet);
        Assert.Equal(new HexPointResponse(scene.Viewer.Q + 3, scene.Viewer.R), army.Position);
        // Two hexes ahead at most, all of them in sight here; nothing of the nine-hex route behind it.
        Assert.Equal(
            [new(scene.Viewer.Q + 3, scene.Viewer.R), new(scene.Viewer.Q + 2, scene.Viewer.R), new(scene.Viewer.Q + 1, scene.Viewer.R)],
            army.Movement.Path);
        Assert.Equal([0d, 1d, 2d], army.Movement.CumulativeHours);
        Assert.Equal([0d, 0.5, 1.5], army.Movement.EdgeHours);
        Assert.Equal(army.Movement.DepartedAt + TimeSpan.FromHours(2), army.Movement.ArrivesAt);
    }

    [Fact]
    public async Task A_foreign_army_near_the_end_of_its_leg_gets_a_stretch_that_ends_with_the_leg()
    {
        var scene = await SceneAsync(6.2);

        var (_, armies) = await GetAsync(scene);

        // 6.2 h: 1 east of the viewer, deep inside sight; the two hexes ahead are the viewer's own hex and the last hex of the leg.
        var army = Assert.Single(armies);
        Assert.Equal(
            [new(scene.Viewer.Q + 1, scene.Viewer.R), new(scene.Viewer.Q, scene.Viewer.R), new(scene.Viewer.Q - 1, scene.Viewer.R)],
            army.Movement.Path);
    }

    [Fact]
    public async Task A_foreign_army_outside_sight_is_not_returned()
    {
        // 1.2 h: stands 6 hexes east of the viewer, beyond the 3-hex ring.
        var scene = await SceneAsync(1.2);

        var (_, armies) = await GetAsync(scene);

        Assert.Empty(armies);
    }

    [Fact]
    public async Task A_foreign_army_inside_the_sight_of_the_viewers_own_marching_army_is_returned()
    {
        // 1.2 h: 6 hexes east of the settlement (outside its ring), and the viewer's own army marches right beside it.
        var scene = await SceneAsync(1.2, viewerArmyBesideRival: true);

        var (_, armies) = await GetAsync(scene);

        var army = Assert.Single(armies);
        Assert.Equal(scene.RivalArmyId, army.Id);
    }

    [Fact]
    public async Task The_viewers_own_armies_are_never_returned_and_nothing_but_the_stretch_leaks()
    {
        var scene = await SceneAsync(4.2);

        var (json, armies) = await GetAsync(scene);

        Assert.DoesNotContain(armies, a => a.Id == scene.ViewerArmyId);
        foreach (var leaked in new[] { "mission", "target", "stacks", "provisions", "returnPath", "spearman", "unit" })
        {
            Assert.DoesNotContain(leaked, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task A_foreign_army_standing_at_home_is_not_returned()
    {
        var scene = await SceneAsync(4.2);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Armies.FindAsync([scene.RivalArmyId], Ct))!.AtHome = true;
            await db.SaveChangesAsync(Ct);
        }

        var (_, armies) = await GetAsync(scene);

        Assert.Empty(armies);
    }
}
