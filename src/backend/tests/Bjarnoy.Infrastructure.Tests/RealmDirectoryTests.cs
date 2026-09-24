using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace Bjarnoy.Infrastructure.Tests;

/// <summary>
/// <see cref="RealmDirectory"/>'s caching contract: a positive lookup is
/// served from cache (a DB row changed underneath it without invalidation
/// stays invisible) until <see cref="RealmDirectory.InvalidateWorld"/> is
/// called for that world, at which point the next lookup is live again.
/// </summary>
public sealed class RealmDirectoryTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;
    private readonly IMemoryCache _cache = new MemoryCache(new MemoryCacheOptions());

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public RealmDirectoryTests()
    {
        _connection.Open();
        var options = new DbContextOptionsBuilder<GameDbContext>()
            .UseSqlite(_connection)
            .Options;
        _dbContext = new GameDbContext(options);
        _dbContext.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _dbContext.Dispose();
        _connection.Dispose();
        _cache.Dispose();
        GC.SuppressFinalize(this);
    }

    /// <summary>A real, minimal user row — needed wherever a test assigns a
    /// settlement's <see cref="SettlementEntity.UserId"/> to something other
    /// than a seeded system user (<c>SystemUserIds.Abandoned</c> and its
    /// siblings come from the model's own <c>HasData</c>), since that column
    /// is a real foreign key.</summary>
    private async Task<Guid> SeedUserAsync()
    {
        var user = new UserEntity
        {
            UserName = $"user-{Guid.CreateVersion7():N}",
            NormalizedUserName = $"user-{Guid.CreateVersion7():N}",
            PasswordHash = string.Empty,
            CreatedAt = DateTimeOffset.UnixEpoch,
            RenownSettledAt = DateTimeOffset.UnixEpoch,
        };
        _dbContext.Users.Add(user);
        await _dbContext.SaveChangesAsync(Ct);
        return user.Id;
    }

    private async Task<(Guid WorldId, Guid SettlementId)> SeedSettlementAsync(string ownerId, Guid userId)
    {
        var worldId = Guid.CreateVersion7();
        var islandId = Guid.CreateVersion7();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });

        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = userId,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = ownerId,
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        };
        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(Ct);

        return (worldId, settlement.Id);
    }

    [Fact]
    public async Task GetOwnershipAsync_serves_a_stale_row_from_cache_until_the_world_is_invalidated()
    {
        var (worldId, settlementId) = await SeedSettlementAsync("owner-1", SystemUserIds.Abandoned);
        var directory = new RealmDirectory(_dbContext, _cache);

        var first = await directory.GetOwnershipAsync(settlementId, Ct);
        Assert.NotNull(first);
        Assert.Equal(SystemUserIds.Abandoned, first!.Value.UserId);

        // Changes the row directly, bypassing RealmDirectory entirely — same
        // as another request's write landing in between two reads of this
        // one, if that write forgot to invalidate.
        var claimedBy = await SeedUserAsync();
        var settlement = await _dbContext.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        settlement.UserId = claimedBy;
        await _dbContext.SaveChangesAsync(Ct);

        var stillCached = await directory.GetOwnershipAsync(settlementId, Ct);
        Assert.Equal(SystemUserIds.Abandoned, stillCached!.Value.UserId);

        RealmDirectory.InvalidateWorld(worldId);

        var freshRead = await directory.GetOwnershipAsync(settlementId, Ct);
        Assert.Equal(claimedBy, freshRead!.Value.UserId);
    }

    [Fact]
    public async Task FindByOwnerAsync_serves_a_stale_row_from_cache_until_the_world_is_invalidated()
    {
        var (worldId, settlementId) = await SeedSettlementAsync("owner-2", SystemUserIds.Abandoned);
        var directory = new RealmDirectory(_dbContext, _cache);

        var first = await directory.FindByOwnerAsync(worldId, "owner-2", Ct);
        Assert.Equal(settlementId, first!.Value.SettlementId);
        Assert.Equal(SystemUserIds.Abandoned, first.Value.UserId);

        var claimedBy = await SeedUserAsync();
        var settlement = await _dbContext.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        settlement.UserId = claimedBy;
        await _dbContext.SaveChangesAsync(Ct);

        var stillCached = await directory.FindByOwnerAsync(worldId, "owner-2", Ct);
        Assert.Equal(SystemUserIds.Abandoned, stillCached!.Value.UserId);

        RealmDirectory.InvalidateWorld(worldId);

        var freshRead = await directory.FindByOwnerAsync(worldId, "owner-2", Ct);
        Assert.Equal(claimedBy, freshRead!.Value.UserId);
    }

    [Fact]
    public async Task FindByUserAsync_never_caches_a_miss()
    {
        var worldId = Guid.CreateVersion7();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = 6 });
        await _dbContext.SaveChangesAsync(Ct);

        var directory = new RealmDirectory(_dbContext, _cache);
        var userId = await SeedUserAsync();

        var beforeFounding = await directory.FindByUserAsync(worldId, userId, Ct);
        Assert.Null(beforeFounding);

        var (_, settlementId) = await SeedRealUserSettlementAsync(worldId, userId);

        // A just-founded realm must be visible immediately, with no
        // invalidation call of its own — see RealmDirectory's remarks on why
        // only positive lookups are cached.
        var afterFounding = await directory.FindByUserAsync(worldId, userId, Ct);
        Assert.Equal(settlementId, afterFounding!.Value.SettlementId);
    }

    private async Task<(Guid WorldId, Guid SettlementId)> SeedRealUserSettlementAsync(Guid worldId, Guid userId)
    {
        var islandId = Guid.CreateVersion7();
        _dbContext.Islands.Add(new IslandEntity { Id = islandId, WorldId = worldId, Name = "Home Isle" });

        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = userId,
            Name = "Home",
            OwnerName = "Player One",
            OwnerId = "owner-3",
            CentreQ = 0,
            CentreR = 0,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 }],
        };
        _dbContext.Settlements.Add(settlement);
        await _dbContext.SaveChangesAsync(Ct);

        return (worldId, settlement.Id);
    }
}
