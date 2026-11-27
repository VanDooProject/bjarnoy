using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.Infrastructure.Services.PlotReservations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// What the API shows of a linked realm (<c>docs/design/economy.md</c> section 5): the oldest settlement reads as the whole realm,
/// a newer member points at it, the lists and the leaderboard show the realm once or under its oldest member's name.
/// </summary>
public sealed class LinkedRealmApiTests : IAsyncLifetime
{
    // Minimum spacing a visitor's plot needs from a longhouse (SettlementService.MinimumSpacing plus its safety margin).
    private const int PlotSpacingForTests = SettlementService.MinimumSpacing + SettlementService.FoundingSafetyMargin;

    private const string OwnerId = "linked-api-player";
    private const string RivalOwnerId = "linked-api-rival";

    private static readonly BuildingType[] Level1Types =
        [BuildingType.StorageHouse, BuildingType.Lumberjack, BuildingType.ClayBrickworks, BuildingType.ReindeerHerder];

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private sealed record Scene(
        Guid WorldId,
        Guid Oldest,
        Guid Newest,
        Guid Unlinked,
        Guid Rival,
        HexCoord OldestCentre,
        HexCoord NewestCentre,
        string AccessToken,
        IReadOnlyList<HexCoord> OldestOnlyHexes,
        IReadOnlyList<HexCoord> NewestOnlyHexes);

    /// <summary>
    /// "Bjornstad" (the oldest), "Lillestad" (a second settlement of the same player whose disc touches it), "Farholm" (the same
    /// player on another island, not linked) and a rival standing between the first two. The player is a registered account.
    /// </summary>
    private async Task<Scene> SetUpAsync(bool leaveRoomForAnotherPlot = false)
    {
        using var anonymous = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync($"w-{Guid.CreateVersion7():N}"[..20], 21, 60, cancellationToken: Ct);
        var islands = (await anonymous.GetFullIslandsAsync(world.Id, Ct))!
            .Where(i => i.StartPositions.Count > 0).ToList();
        Assert.True(islands.Count >= 2, "the world needs two islands with a start position");

        var plot = islands[0].StartPositions[0];
        if (leaveRoomForAnotherPlot)
        {
            // The realm's three longhouses (x, x + 2, x + 5) sit where a second founding plot of the island is still allowed
            // (Founding spacing is 15 hexes), so a visitor can be offered this island.
            plot = islands[0].StartPositions.First(p => islands[0].StartPositions.Any(c => new[] { 0, 2, 5 }
                .All(dx => new HexCoord(p.Q + dx, p.R).DistanceTo(new HexCoord(c.Q, c.R)) >= PlotSpacingForTests)));
        }
        var founded = await anonymous.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(islands[0].Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var oldest = await founded.ReadStrictAsync<SettlementResponse>(Ct);

        var reach = Settlement.ClaimRadiusForLonghouseLevel(1);
        var oldestCentre = new HexCoord(plot.Q, plot.R);
        var newestCentre = new HexCoord(plot.Q + (2 * reach) + 1, plot.R);
        var rivalCentre = new HexCoord(plot.Q + reach, plot.R);
        var otherPlot = islands[1].StartPositions[0];

        Guid newestId;
        Guid unlinkedId;
        Guid rivalId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var first = await db.Settlements.AsNoTracking().FirstAsync(s => s.Id == oldest.Id, Ct);
            var speed = (await db.Worlds.AsNoTracking().FirstAsync(w => w.Id == world.Id, Ct)).SpeedFactor;
            var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
            production *= speed;

            SettlementEntity Member(string name, HexCoord centre, Guid islandId, DateTimeOffset foundedAt, string ownerId, string ownerName)
            {
                var entity = new SettlementEntity
                {
                    WorldId = world.Id,
                    IslandId = islandId,
                    Name = name,
                    OwnerName = ownerName,
                    OwnerId = ownerId,
                    UserId = first.UserId,
                    FoundedAt = foundedAt,
                };
                entity.ApplyDomain(new Settlement
                {
                    Id = entity.Id,
                    Name = name,
                    Centre = centre,
                    Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, 1)],
                    Resources = ResourcePool.Create(BuildingCatalogue.FoundingStock * 0.25, production, capacity, first.SettledAt),
                });
                return entity;
            }

            var newest = Member("Lillestad", newestCentre, first.IslandId, first.FoundedAt.AddMinutes(10), first.OwnerId, first.OwnerName);
            var unlinked = Member(
                "Farholm", new HexCoord(otherPlot.Q, otherPlot.R), islands[1].Id, first.FoundedAt.AddMinutes(20), first.OwnerId, first.OwnerName);
            var rival = Member("Rivalheim", rivalCentre, first.IslandId, first.FoundedAt.AddMinutes(5), RivalOwnerId, "Rival");
            db.Settlements.AddRange(newest, unlinked, rival);
            await db.SaveChangesAsync(Ct);
            newestId = newest.Id;
            unlinkedId = unlinked.Id;
            rivalId = rival.Id;
        }

        // A real account claims everything still carrying the owner id; the rival stays anonymous.
        var registered = await anonymous.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest($"p-{Guid.CreateVersion7():N}"[..20], "correct-horse-battery", OwnerId), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        var oldestOnly = oldestCentre.WithinRadius(reach).Where(h => h != oldestCentre && newestCentre.DistanceTo(h) > reach).ToList();
        var newestOnly = newestCentre.WithinRadius(reach).Where(h => h != newestCentre && oldestCentre.DistanceTo(h) > reach).ToList();
        return new Scene(
            world.Id, oldest.Id, newestId, unlinkedId, rivalId, oldestCentre, newestCentre, auth.AccessToken, oldestOnly, newestOnly);
    }

    private HttpClient Player(Scene scene)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", scene.AccessToken);
        return client;
    }

    private HttpClient Rival()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", RivalOwnerId);
        return client;
    }

    private async Task<HexCoord> QueueBuildingAsync(Guid requested, IEnumerable<HexCoord> hexes)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var settlements = scope.ServiceProvider.GetRequiredService<SettlementService>();
        foreach (var hex in hexes)
        {
            foreach (var type in Level1Types)
            {
                if ((await settlements.QueueBuildAsync(requested, type, hex, Ct)).Accepted)
                {
                    return hex;
                }
            }
        }

        throw new InvalidOperationException("no hex accepted a level 1 building");
    }

    private async Task<SettlementEntity> StoredAsync(Guid id)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Settlements.AsNoTracking().FirstAsync(s => s.Id == id, Ct);
    }

    private static async Task<T> GetAsync<T>(HttpClient client, string url) =>
        (await client.GetFromJsonAsync<T>(url, SqliteApiFixture.StrictJson, Ct))!;

    [Fact]
    public async Task The_oldest_members_read_is_the_whole_realm()
    {
        var scene = await SetUpAsync();
        var newestHex = await QueueBuildingAsync(scene.Oldest, scene.NewestOnlyHexes);
        var oldestHex = await QueueBuildingAsync(scene.Oldest, scene.OldestOnlyHexes);
        using var client = Player(scene);

        var oldest = await GetAsync<SettlementResponse>(client, $"/api/v1/settlements/{scene.Oldest}");

        var storedOldest = await StoredAsync(scene.Oldest);
        var storedNewest = await StoredAsync(scene.Newest);
        Assert.Equal("Bjornstad", oldest.Name);
        Assert.Equal(scene.Oldest, oldest.RealmId);
        Assert.Equal([scene.Oldest, scene.Newest], oldest.LinkedMemberIds);

        // Pooled: the newer member's own stock is part of what the oldest shows, and its capacity adds to the cap.
        Assert.True(oldest.Resources.Stock.Wood >= Math.Floor(storedOldest.StockWood + storedNewest.StockWood) - 1);
        Assert.Equal(storedOldest.CapacityWood + storedNewest.CapacityWood, oldest.Resources.Capacity.Wood, 3);
        Assert.True(storedOldest.CapacityWood < oldest.Resources.Capacity.Wood);

        // A lone longhouse has two slots; the linked pair has four.
        Assert.Equal(4, oldest.Construction.Slots);

        // Both members' buildings and both members' orders (one booked on each).
        Assert.Contains(oldest.Buildings, b => b.Q == scene.OldestCentre.Q && b.R == scene.OldestCentre.R && b.Type == "longhouse");
        Assert.Contains(oldest.Buildings, b => b.Q == scene.NewestCentre.Q && b.R == scene.NewestCentre.R && b.Type == "longhouse");
        Assert.Equal(2, oldest.Queue.Count);
        Assert.Contains(oldest.Queue, o => o.Q == newestHex.Q && o.R == newestHex.R);
        Assert.Contains(oldest.Queue, o => o.Q == oldestHex.Q && o.R == oldestHex.R);
        Assert.Equal(2, oldest.Construction.SlotsUsed);
    }

    [Fact]
    public async Task A_newer_members_read_carries_the_realm_id_the_pooled_stock_and_its_own_buildings()
    {
        var scene = await SetUpAsync();
        using var client = Player(scene);

        var oldest = await GetAsync<SettlementResponse>(client, $"/api/v1/settlements/{scene.Oldest}");
        var newest = await GetAsync<SettlementResponse>(client, $"/api/v1/settlements/{scene.Newest}");

        Assert.Equal(scene.Newest, newest.Id);
        Assert.Equal(scene.Oldest, newest.RealmId);
        Assert.Equal([scene.Oldest, scene.Newest], newest.LinkedMemberIds);
        Assert.Equal(oldest.Resources.Stock, newest.Resources.Stock);
        Assert.Equal(oldest.Resources.Capacity, newest.Resources.Capacity);
        Assert.Equal(oldest.Construction.Slots, newest.Construction.Slots);
        var own = Assert.Single(newest.Buildings);
        Assert.Equal(scene.NewestCentre.Q, own.Q);
    }

    [Fact]
    public async Task An_unlinked_settlement_of_the_same_player_reads_as_itself()
    {
        var scene = await SetUpAsync();
        using var client = Player(scene);

        var lone = await GetAsync<SettlementResponse>(client, $"/api/v1/settlements/{scene.Unlinked}");

        Assert.Equal("Farholm", lone.Name);
        Assert.Equal(scene.Unlinked, lone.RealmId);
        Assert.Equal([scene.Unlinked], lone.LinkedMemberIds);
        Assert.Equal(2, lone.Construction.Slots);
        Assert.Single(lone.Buildings);
        Assert.Equal(BuildingCatalogue.MaxTowers(1), lone.Construction.TowerLimit);
        Assert.Equal(0, lone.Construction.TowersHeld);
    }

    [Fact]
    public async Task The_tower_hint_is_the_realms_limit_and_towers_held_for_every_member()
    {
        var scene = await SetUpAsync();

        // Both longhouses at level 3 (a limit of one tower each), and one connected tower standing in the newer member.
        var towerHex = scene.NewestOnlyHexes[0];
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            foreach (var id in new[] { scene.Oldest, scene.Newest })
            {
                var entity = await db.Settlements.Include(s => s.Buildings).Include(s => s.Queue).Include(s => s.Garrison)
                    .Include(s => s.TrainingQueue).Include(s => s.Runes).FirstAsync(s => s.Id == id, Ct);
                var domain = entity.ToDomain();
                var buildings = domain.Buildings.Select(b => b.Type == BuildingType.Longhouse ? b with { Level = 3 } : b).ToList();
                if (id == scene.Newest)
                {
                    buildings.Add(new PlacedBuilding(towerHex, BuildingType.Tower, 1));
                }

                entity.ApplyDomain(domain with { Buildings = buildings });
            }

            await db.SaveChangesAsync(Ct);
        }

        using var client = Player(scene);
        var oldest = await GetAsync<SettlementResponse>(client, $"/api/v1/settlements/{scene.Oldest}");
        var newest = await GetAsync<SettlementResponse>(client, $"/api/v1/settlements/{scene.Newest}");

        Assert.Equal(2 * BuildingCatalogue.MaxTowers(3), oldest.Construction.TowerLimit);
        Assert.Equal(2, oldest.Construction.TowerLimit);
        Assert.Equal(1, oldest.Construction.TowersHeld);
        Assert.Equal(oldest.Construction.TowerLimit, newest.Construction.TowerLimit);
        Assert.Equal(oldest.Construction.TowersHeld, newest.Construction.TowersHeld);
    }

    [Fact]
    public async Task The_own_list_has_one_entry_per_linked_realm()
    {
        var scene = await SetUpAsync();
        using var client = Player(scene);

        var mine = await GetAsync<List<SettlementSummary>>(client, $"/api/v1/worlds/{scene.WorldId}/settlements/mine");

        Assert.Equal(2, mine.Count);
        Assert.Contains(mine, s => s.Id == scene.Oldest && s.Name == "Bjornstad" && s.RealmId == scene.Oldest);
        Assert.Contains(mine, s => s.Id == scene.Unlinked && s.Name == "Farholm" && s.RealmId == scene.Unlinked);
        Assert.DoesNotContain(mine, s => s.Id == scene.Newest);
    }

    [Fact]
    public async Task The_world_list_keeps_every_longhouse_under_the_oldest_members_name_for_the_owner()
    {
        var scene = await SetUpAsync();
        using var client = Player(scene);

        var list = await GetAsync<List<SettlementSummary>>(client, $"/api/v1/worlds/{scene.WorldId}/settlements");

        var oldest = Assert.Single(list, s => s.Id == scene.Oldest);
        var newest = Assert.Single(list, s => s.Id == scene.Newest);
        var lone = Assert.Single(list, s => s.Id == scene.Unlinked);
        Assert.All([oldest, newest], s => Assert.Equal("Bjornstad", s.Name));
        Assert.All([oldest, newest], s => Assert.Equal(scene.Oldest, s.RealmId));
        Assert.All([oldest, newest, lone], s => Assert.True(s.Mine));
        Assert.Equal("Farholm", lone.Name);
        Assert.Equal(scene.Unlinked, lone.RealmId);
    }

    [Fact]
    public async Task The_world_list_shows_a_rival_both_longhouses_under_the_oldest_members_name()
    {
        var scene = await SetUpAsync();
        using var rival = Rival();

        var list = await GetAsync<List<SettlementSummary>>(rival, $"/api/v1/worlds/{scene.WorldId}/settlements");

        var oldest = Assert.Single(list, s => s.Id == scene.Oldest);
        var newest = Assert.Single(list, s => s.Id == scene.Newest);
        Assert.All([oldest, newest], s => Assert.Equal("Bjornstad", s.Name));
        Assert.All([oldest, newest], s => Assert.Equal(scene.Oldest, s.RealmId));
        Assert.All([oldest, newest], s => Assert.False(s.Mine));
    }

    [Fact]
    public async Task The_rival_view_of_a_newer_member_shows_the_realms_name()
    {
        var scene = await SetUpAsync();
        using var rival = Rival();

        var view = await GetAsync<SettlementViewResponse>(rival, $"/api/v1/settlements/{scene.Newest}/view");

        Assert.Equal(scene.Newest, view.Id);
        Assert.Equal("Bjornstad", view.Name);
    }

    [Fact]
    public async Task The_plot_suggestion_island_list_names_each_longhouse_after_its_realm()
    {
        var scene = await SetUpAsync(leaveRoomForAnotherPlot: true);
        using var visitor = _factory.CreateClient();
        visitor.DefaultRequestHeaders.Add("X-Owner-Id", "linked-api-visitor");

        // Left alone the service offers the emptier island, which is not the realm's. Pin the visitor's last suggestion to a
        // plot still free on the realm's island, so the island list always holds the realm.
        Guid realmIsland;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            realmIsland = (await db.Settlements.AsNoTracking().FirstAsync(s => s.Id == scene.Oldest, Ct)).IslandId;
            var island = await db.Islands.AsNoTracking().FirstAsync(i => i.Id == realmIsland, Ct);
            var centres = await db.Settlements.AsNoTracking()
                .Where(s => s.IslandId == realmIsland).Select(s => new HexCoord(s.CentreQ, s.CentreR)).ToListAsync(Ct);
            var free = island.FoundableStartPositions()
                .Select(p => (HexCoord?)new HexCoord(p.Q, p.R))
                .FirstOrDefault(c => centres.All(x => x.DistanceTo(c!.Value) >= PlotSpacingForTests));
            Assert.True(free is not null, "the realm's island needs a free founding plot");

            scope.ServiceProvider.GetRequiredService<IPlotReservationStore>().RememberSuggestion(
                new LastSuggestion(scene.WorldId, "linked-api-visitor", realmIsland, free!.Value, _factory.Time.GetUtcNow().AddHours(1)));
        }

        var suggestion = await GetAsync<PlotSuggestionResponse>(visitor, $"/api/v1/worlds/{scene.WorldId}/plot-suggestion");

        Assert.Equal(realmIsland, suggestion.IslandId);
        var sameIsland = suggestion.IslandSettlements.Where(s => s.Id == scene.Oldest || s.Id == scene.Newest).ToList();
        Assert.Equal(2, sameIsland.Count);
        Assert.All(sameIsland, s => Assert.Equal("Bjornstad", s.Name));
        Assert.All(sameIsland, s => Assert.Equal(scene.Oldest, s.RealmId));
    }

    [Fact]
    public async Task The_settlement_leaderboard_shows_a_linked_realm_once_with_the_members_scores_added_up()
    {
        var scene = await SetUpAsync();
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            await scope.ServiceProvider.GetRequiredService<LeaderboardService>().RefreshCurrentBoardsAsync(scene.WorldId, Ct);
        }

        using var client = _factory.CreateClient();
        var board = await GetAsync<LeaderboardBoardResponse>(
            client, $"/api/v1/worlds/{scene.WorldId}/leaderboards/settlement/biggestSettlement");

        Assert.Equal(2, board.Items.Count);
        var realm = Assert.Single(board.Items, i => i.SubjectName == "Bjornstad");
        Assert.Equal(scene.Oldest, realm.SubjectId);
        Assert.Equal(2, realm.Value);
        var lone = Assert.Single(board.Items, i => i.SubjectName == "Farholm");
        Assert.Equal(scene.Unlinked, lone.SubjectId);
        Assert.Equal(1, lone.Value);
        Assert.DoesNotContain(board.Items, i => i.SubjectName == "Lillestad");
    }
}
