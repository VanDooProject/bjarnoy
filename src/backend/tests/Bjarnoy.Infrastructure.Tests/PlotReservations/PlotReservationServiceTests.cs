using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services.PlotReservations;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Infrastructure.Tests.PlotReservations;

public class PlotReservationServiceTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;
    private readonly TestTimeProvider _time = new(DateTimeOffset.UtcNow);
    private readonly InMemoryPlotReservationStore _store;
    private readonly PlotReservationOptions _options = new();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public PlotReservationServiceTests()
    {
        _connection.Open();
        var dbOptions = new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options;
        _dbContext = new GameDbContext(dbOptions);
        _dbContext.Database.EnsureCreated();
        _store = new InMemoryPlotReservationStore(_time);
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
    }

    private PlotReservationService CreateService() => new(_dbContext, _store, _time, Options.Create(_options));

    private Guid AddWorld(int maxPlayers = 100)
    {
        var worldId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", MaxPlayers = maxPlayers });
        return worldId;
    }

    private Guid AddIsland(Guid worldId, int index, int centreQ, int centreR, params (int Q, int R)[] startPositions)
    {
        var islandId = Guid.NewGuid();
        _dbContext.Islands.Add(new IslandEntity
        {
            Id = islandId,
            WorldId = worldId,
            Index = index,
            Name = $"Island {index}",
            CentreQ = centreQ,
            CentreR = centreR,
            StartPositions = [.. startPositions.Select(p => new HexPoint(p.Q, p.R))],
        });
        return islandId;
    }

    [Fact]
    public async Task Same_owner_gets_the_same_pinned_plot_across_repeated_requests()
    {
        var worldId = AddWorld();
        AddIsland(worldId, 0, 0, 0, (0, 0), (2, 0));
        await _dbContext.SaveChangesAsync(Ct);
        var service = CreateService();

        var first = await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);
        var second = await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);

        Assert.True(first.Accepted);
        Assert.True(second.Accepted);
        Assert.Equal(first.Suggestion!.Plot, second.Suggestion!.Plot);
        Assert.Equal(first.Suggestion.IslandId, second.Suggestion.IslandId);
    }

    [Fact]
    public async Task Two_owners_get_plots_that_clear_ReservationSpacing_apart()
    {
        var worldId = AddWorld();
        var positions = Enumerable.Range(0, 40).Select(i => (i * 3, 0)).ToArray();
        AddIsland(worldId, 0, 0, 0, positions);
        await _dbContext.SaveChangesAsync(Ct);
        var service = CreateService();

        var first = await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);
        var second = await service.GetOrRefreshAsync(worldId, "owner-2", "ip-2", "fp-2", Ct);

        Assert.True(first.Accepted);
        Assert.True(second.Accepted);
        var distance = first.Suggestion!.Plot.DistanceTo(second.Suggestion!.Plot);
        Assert.True(distance >= PlotReservationService.ReservationSpacing);
    }

    [Fact]
    public async Task An_owner_who_already_founded_gets_AlreadyFounded_and_their_reservation_is_released()
    {
        var worldId = AddWorld();
        var islandId = AddIsland(worldId, 0, 0, 0, (0, 0));
        await _dbContext.SaveChangesAsync(Ct);
        var service = CreateService();
        await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);

        var settlementId = Guid.NewGuid();
        _dbContext.Settlements.Add(new SettlementEntity
        {
            Id = settlementId,
            WorldId = worldId,
            IslandId = islandId,
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = "Astrid",
            OwnerId = "owner-1",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
        });
        await _dbContext.SaveChangesAsync(Ct);

        var result = await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);

        Assert.Equal(PlotSuggestionRejection.AlreadyFounded, result.Rejection);
        Assert.Equal(settlementId, result.ExistingSettlementId);
        Assert.Null(_store.GetReservation(worldId, "owner-1"));
    }

    [Fact]
    public async Task Once_the_IP_cap_is_hit_further_owners_still_get_a_suggestion_but_not_reserved()
    {
        var worldId = AddWorld();
        var positions = Enumerable.Range(0, 10).Select(i => (i * 20, 0)).ToArray();
        AddIsland(worldId, 0, 0, 0, positions);
        await _dbContext.SaveChangesAsync(Ct);
        _options.MaxReservationsPerIp = 1;
        var service = CreateService();

        var first = await service.GetOrRefreshAsync(worldId, "owner-1", "shared-ip", "fp-1", Ct);
        var second = await service.GetOrRefreshAsync(worldId, "owner-2", "shared-ip", "fp-2", Ct);

        Assert.True(first.Suggestion!.Reserved);
        Assert.True(second.Accepted);
        Assert.False(second.Suggestion!.Reserved);
        Assert.Null(second.Suggestion.ReservedUntil);
    }

    [Fact]
    public async Task After_a_reservation_expires_a_different_owner_can_be_pinned_to_the_same_plot()
    {
        var worldId = AddWorld();
        AddIsland(worldId, 0, 0, 0, (0, 0));
        await _dbContext.SaveChangesAsync(Ct);
        var service = CreateService();

        var first = await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);
        Assert.True(first.Suggestion!.Reserved);

        _time.Advance(_options.ReservationTtl + TimeSpan.FromSeconds(1));

        var second = await service.GetOrRefreshAsync(worldId, "owner-2", "ip-2", "fp-2", Ct);

        Assert.True(second.Accepted);
        Assert.Equal(first.Suggestion.Plot, second.Suggestion!.Plot);
    }

    [Fact]
    public async Task No_islands_yields_NoPlotAvailable()
    {
        var worldId = AddWorld();
        await _dbContext.SaveChangesAsync(Ct);
        var service = CreateService();

        var result = await service.GetOrRefreshAsync(worldId, "owner-1", "ip-1", "fp-1", Ct);

        Assert.Equal(PlotSuggestionRejection.NoPlotAvailable, result.Rejection);
        Assert.False(result.Accepted);
    }
}
