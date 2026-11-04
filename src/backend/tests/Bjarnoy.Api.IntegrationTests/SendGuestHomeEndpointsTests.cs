using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The host's "send home" for a guest (support) army
/// (<c>POST /settlements/{id}/guests/{armyId}/send-home</c>): only the
/// host's owner may call it, it only reaches armies that are guests at that
/// very settlement, and it recalls the guest the same way its own owner's
/// recall does.
/// </summary>
public sealed class SendGuestHomeEndpointsTests : IAsyncLifetime
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

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void SetOwner(HttpClient client, string ownerId)
    {
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
    }

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> query)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await query(db);
    }

    private async Task<(Guid WorldId, Guid IslandId)> AddWorldAsync(GameDbContext db)
    {
        var world = new WorldEntity { Name = Unique("w"), MaxPlayers = 100 };
        world.ApplyGenerationOptions(TestWorlds.For(1, 60));
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        await db.SaveChangesAsync(Ct);
        return (world.Id, island.Id);
    }

    /// <summary>An unclaimed settlement — owned only by its own client-local <paramref name="ownerId"/>.</summary>
    private static SettlementEntity MakeSettlement(
        DateTimeOffset now, Guid worldId, Guid islandId, string ownerId, int centreQ, int centreR)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var entity = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = Unique("s"),
            OwnerName = "Owner",
            OwnerId = ownerId,
            UserId = SystemUserIds.Abandoned,
            CentreQ = centreQ,
            CentreR = centreR,
            FoundedAt = now,
        };
        entity.ApplyDomain(new Settlement
        {
            Id = entity.Id,
            Name = entity.Name,
            Centre = new HexCoord(centreQ, centreR),
            Buildings = [new PlacedBuilding(new HexCoord(centreQ, centreR), BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(
                capacity * 0.9, production, capacity, now),
        });
        return entity;
    }

    private async Task<(Guid WorldId, Guid MineId, string MineOwnerId, Guid RivalId, string RivalOwnerId)>
        TwoSettlementsAsync()
    {
        var mineOwnerId = Unique("mine");
        var rivalOwnerId = Unique("rival");
        var (worldId, mineId, rivalId) = await WithDbAsync(async db =>
        {
            var (wId, islandId) = await AddWorldAsync(db);
            // Both on open grass with a straight grass line between them, so
            // the recalled guest really has a route home.
            var world = await db.Worlds.SingleAsync(w => w.Id == wId, Ct);
            var sampler = await WorldTerrain.SamplerAsync(db, world, Ct);
            var (q, r) = Enumerable.Range(-300, 601)
                .SelectMany(r => Enumerable.Range(-300, 601).Select(q => (q, r)))
                .First(c => Enumerable.Range(0, 4).All(d => sampler.TerrainAt(new HexCoord(c.q + d, c.r)) == Terrain.Grass));
            var mine = MakeSettlement(_factory.Time.GetUtcNow(), wId, islandId, mineOwnerId, q, r);
            var rival = MakeSettlement(_factory.Time.GetUtcNow(), wId, islandId, rivalOwnerId, q + 3, r);
            db.Settlements.AddRange(mine, rival);
            await db.SaveChangesAsync(Ct);
            return (wId, mine.Id, rival.Id);
        });
        return (worldId, mineId, mineOwnerId, rivalId, rivalOwnerId);
    }

    private async Task<Guid> PlantGuestArmyAsync(Guid hostSettlementId, Guid guestHomeSettlementId, int count = 5)
    {
        var now = _factory.Time.GetUtcNow();
        var army = new ArmyEntity
        {
            SettlementId = guestHomeSettlementId,
            Mission = (int)ArmyMission.Support,
            AtHome = false,
            IsSupporting = true,
            TargetSettlementId = hostSettlementId,
            Provisions = 100,
            DepartedAt = now,
            Path = [new HexPoint(0, 0)],
            CumulativeHours = [0],
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Spearman, Count = count }],
        };
        return await WithDbAsync(async db =>
        {
            db.Armies.Add(army);
            await db.SaveChangesAsync(Ct);
            return army.Id;
        });
    }

    private static string SendHome(Guid hostId, Guid armyId) =>
        $"/api/v1/settlements/{hostId}/guests/{armyId}/send-home";

    [Fact]
    public async Task The_host_owner_sends_a_guest_home()
    {
        using var client = Client();
        var (_, hostId, hostOwnerId, guestHomeId, guestOwnerId) = await TwoSettlementsAsync();
        var armyId = await PlantGuestArmyAsync(hostId, guestHomeId);

        SetOwner(client, hostOwnerId);
        var response = await client.PostAsync(SendHome(hostId, armyId), content: null, Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(0, response.Content.Headers.ContentLength ?? 0);

        // Gone from the host's guest list ...
        var guests = await client.GetFromJsonAsync<List<GuestArmySummary>>(
            $"/api/v1/settlements/{hostId}/guests", SqliteApiFixture.StrictJson, Ct);
        Assert.Empty(guests!);

        // ... and, to its own owner, simply returning home (no report).
        SetOwner(client, guestOwnerId);
        var army = await client.GetFromJsonAsync<ArmyResponse>(
            $"/api/v1/armies/{armyId}", SqliteApiFixture.StrictJson, Ct);
        Assert.False(army!.Supporting);
        Assert.True(army.Movement!.IsReturning);
    }

    [Fact]
    public async Task The_guests_own_owner_cannot_use_the_hosts_send_home()
    {
        using var client = Client();
        var (_, hostId, _, guestHomeId, guestOwnerId) = await TwoSettlementsAsync();
        var armyId = await PlantGuestArmyAsync(hostId, guestHomeId);

        SetOwner(client, guestOwnerId);
        var response = await client.PostAsync(SendHome(hostId, armyId), content: null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Single(await WithDbAsync(db => db.Armies.Where(a => a.IsSupporting).ToListAsync(Ct)));
    }

    [Fact]
    public async Task A_stranger_cannot_send_a_guest_home()
    {
        using var client = Client();
        var (_, hostId, _, guestHomeId, _) = await TwoSettlementsAsync();
        var armyId = await PlantGuestArmyAsync(hostId, guestHomeId);

        SetOwner(client, Unique("stranger"));
        var response = await client.PostAsync(SendHome(hostId, armyId), content: null, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_army_that_is_not_a_guest_at_this_settlement_is_not_found()
    {
        using var client = Client();
        var (_, hostId, hostOwnerId, guestHomeId, _) = await TwoSettlementsAsync();
        var elsewhereArmyId = await PlantGuestArmyAsync(guestHomeId, hostId);
        var ownArmyId = await WithDbAsync(async db =>
        {
            var army = new ArmyEntity
            {
                SettlementId = hostId,
                Mission = (int)ArmyMission.Move,
                Provisions = 100,
                DepartedAt = _factory.Time.GetUtcNow(),
                Path = [new HexPoint(0, 0), new HexPoint(5, 0)],
                CumulativeHours = [0, 10],
                ReturnPath = [new HexPoint(5, 0), new HexPoint(0, 0)],
                ReturnCumulativeHours = [0, 10],
                TurnAroundAt = _factory.Time.GetUtcNow() + TimeSpan.FromHours(100),
                Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Spearman, Count = 5 }],
            };
            db.Armies.Add(army);
            await db.SaveChangesAsync(Ct);
            return army.Id;
        });

        SetOwner(client, hostOwnerId);

        // A guest of somebody else's settlement, the host's own marching
        // army, and an id that does not exist at all.
        foreach (var id in new[] { elsewhereArmyId, ownArmyId, Guid.CreateVersion7() })
        {
            var response = await client.PostAsync(SendHome(hostId, id), content: null, Ct);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }

        Assert.False(await WithDbAsync(db => db.Armies.Where(a => a.Id == ownArmyId).Select(a => a.IsReturning).SingleAsync(Ct)));
    }

    [Fact]
    public async Task Sending_the_same_guest_home_twice_is_not_found_the_second_time()
    {
        using var client = Client();
        var (_, hostId, hostOwnerId, guestHomeId, _) = await TwoSettlementsAsync();
        var armyId = await PlantGuestArmyAsync(hostId, guestHomeId);

        SetOwner(client, hostOwnerId);
        await client.PostAsync(SendHome(hostId, armyId), content: null, Ct);
        var again = await client.PostAsync(SendHome(hostId, armyId), content: null, Ct);

        Assert.Equal(HttpStatusCode.NotFound, again.StatusCode);
    }

    /// <summary>
    /// A guest is fed from the host's food (SettlementService passes its
    /// stacks into the settle as upkeep). Once the host sends it home the
    /// food stock must grow faster by exactly that upkeep.
    /// </summary>
    [Fact]
    public async Task The_hosts_food_upkeep_drops_by_the_guests_upkeep_once_it_is_sent_home()
    {
        using var client = Client();
        var (_, hostId, hostOwnerId, guestHomeId, _) = await TwoSettlementsAsync();
        var armyId = await PlantGuestArmyAsync(hostId, guestHomeId, count: 400);

        SetOwner(client, hostOwnerId);
        var guest = Assert.Single((await client.GetFromJsonAsync<List<GuestArmySummary>>(
            $"/api/v1/settlements/{hostId}/guests", SqliteApiFixture.StrictJson, Ct))!);
        Assert.True(guest.TotalUpkeepPerHour >= 50, "the guest must cost enough to show up in whole food units");

        async Task<double> FoodAsync() =>
            (await client.GetFromJsonAsync<SettlementResponse>(
                $"/api/v1/settlements/{hostId}", SqliteApiFixture.StrictJson, Ct))!.Resources.Stock.Food;

        var start = await FoodAsync();
        _factory.Time.Advance(TimeSpan.FromHours(1));
        var withGuest = await FoodAsync() - start;

        var sent = await client.PostAsync(SendHome(hostId, armyId), content: null, Ct);
        Assert.Equal(HttpStatusCode.NoContent, sent.StatusCode);
        var afterSend = await FoodAsync();
        _factory.Time.Advance(TimeSpan.FromHours(1));
        var withoutGuest = await FoodAsync() - afterSend;

        // Stock is floored to whole units on each side of the subtraction.
        Assert.InRange(withoutGuest - withGuest, guest.TotalUpkeepPerHour - 2, guest.TotalUpkeepPerHour + 2);
    }
}
