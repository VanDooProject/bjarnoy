using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Naglfar (docs/design/endgame.md, "Naglfar") shares the water-camp plumbing of the whale road, so its end-to-end checks live beside
/// them and reuse the same sea setup. It sits on a wasted island and is hidden with it until the endboss has triggered.
/// </summary>
public sealed partial class WhaleRoadEndpointsTests
{
    /// <summary>Marks an island other than the settlement's as a wasted one and returns its id.</summary>
    private async Task<Guid> MakeAWastedIslandAsync(Setup setup)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var island = await db.Islands.Where(i => i.WorldId == setup.WorldId && i.Id != setup.IslandId).OrderBy(i => i.Index).FirstAsync(Ct);
        island.IsWasted = true;
        await db.SaveChangesAsync(Ct);
        WorldIslandCaches.Invalidate(setup.WorldId);
        return island.Id;
    }

    private async Task TriggerTheEndbossAsync(Guid worldId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        (await db.Worlds.SingleAsync(w => w.Id == worldId, Ct)).EndbossTriggeredAt = _factory.Time.GetUtcNow();
        await db.SaveChangesAsync(Ct);
        WorldIslandCaches.Invalidate(worldId);
    }

    [Fact]
    public async Task A_hidden_naglfar_neither_ambushes_nor_can_be_hunted_until_the_endboss_has_triggered()
    {
        using var client = Client();
        var setup = await FoundOnTheCoastAsync(client);
        var wasted = await MakeAWastedIslandAsync(setup);
        var far = OpenSeaTargets(setup.Terrain, setup.Home)[0];

        var dispatched = await DispatchAsync(client, setup.Settlement.Id, "karve", 2, far, 60);
        Assert.Equal(HttpStatusCode.Created, dispatched.StatusCode);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);
        var movement = army.Movement!;

        // Naglfar anchored on the route, three hexes out: its guard range of 8 covers the whole stretch the fleet sails.
        var site = new HexCoord(movement.Path[3].Q, movement.Path[3].R);
        await PlantCampAsync(setup, site, CampFamilies.Naglfar, islandId: wasted);

        // Hidden: it cannot be hunted ...
        var hunt = await DispatchAsync(client, setup.Settlement.Id, "snekkja", 5, site, 60, "hunt");
        Assert.Equal(HttpStatusCode.Conflict, hunt.StatusCode);
        Assert.Equal("NoCampAtDestination", await hunt.RejectionAsync(Ct));

        // ... and it does not ambush the fleet sailing past.
        var passed = movement.DepartedAt + TimeSpan.FromHours(movement.CumulativeHours[3]) + TimeSpan.FromMinutes(1);
        _factory.Time.Advance(passed - _factory.Time.GetUtcNow());
        var read = await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{army.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.False(read!.Movement!.IsReturning);
        Assert.Equal(2, read.Stacks.Single().Count);
        Assert.Empty((await CampReportsAsync(client, setup.Settlement.Id))!);

        // Once the endboss has triggered the same camp is there: the fleet in its guard range is ambushed, in a full battle (the two
        // karves, defense 60 against 60 000, are all lost), and it can be hunted by ships only.
        await TriggerTheEndbossAsync(setup.WorldId);
        await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);

        var report = Assert.Single((await CampReportsAsync(client, setup.Settlement.Id))!);
        Assert.Equal(("ambush", "camp"), (report.Kind, report.Winner));
        Assert.Equal(CampFamilies.Naglfar, report.Camp.Family);
        Assert.Equal(2, report.Units.Single().Lost);
        Assert.Equal(8, (await SettlementAsync(client, setup.Settlement.Id)).Garrison.Single(g => g.Unit == "karve").Count);

        var ships = await DispatchAsync(client, setup.Settlement.Id, "snekkja", 5, site, 60, "hunt");
        Assert.Equal(HttpStatusCode.Created, ships.StatusCode);
        var land = await DispatchAsync(client, setup.Settlement.Id, "axeman", 10, site, 60, "hunt");
        Assert.Equal("HuntRequiresFleet", await land.RejectionAsync(Ct));
    }
}
