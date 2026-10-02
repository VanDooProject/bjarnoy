using Bjarnoy.Domain.Palisades;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Palisades;

/// <summary>How a world's Utgard walls reach the movement rules: <see cref="WorldPalisades.IndexAsync"/> feeds the standing ones.</summary>
public sealed class WorldPalisadesUtgardTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public WorldPalisadesUtgardTests()
    {
        _connection.Open();
        using var setup = CreateContext();
        setup.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    private GameDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    private static IslandEntity Island(Guid worldId, int index, bool wasted, params UtgardWallRecord[] walls) => new()
    {
        WorldId = worldId, Index = index, Name = $"I{index}", CentreQ = 0, CentreR = 0, IsWasted = wasted, UtgardWalls = [.. walls],
    };

    [Fact]
    public async Task Standing_utgard_walls_block_and_a_breached_hex_does_not()
    {
        await using var db = CreateContext();
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        db.Worlds.Add(world);
        db.Islands.Add(Island(
            world.Id, 0, wasted: true,
            new UtgardWallRecord(10, 0, 0, (int)PalisadePiece.Straight180, 0, false, 2),
            new UtgardWallRecord(11, 0, 1, (int)PalisadePiece.Straight180, 0, false, 1),
            new UtgardWallRecord(12, 0, 1, (int)PalisadePiece.Straight180, 0, false, 0)));
        await db.SaveChangesAsync(Ct);

        var index = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, Ct);

        Assert.True(index.IsWall(new HexCoord(10, 0)));
        Assert.True(index.IsWall(new HexCoord(11, 0)));
        Assert.False(index.IsWall(new HexCoord(12, 0)));
    }

    [Fact]
    public async Task A_jotnar_gate_is_never_friendly_to_any_owner_and_walls_of_other_worlds_do_not_count()
    {
        await using var db = CreateContext();
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        var other = new WorldEntity { Name = "Other", MaxPlayers = 10 };
        db.Worlds.AddRange(world, other);
        db.Islands.Add(Island(world.Id, 0, wasted: true, new UtgardWallRecord(10, 0, 0, (int)PalisadePiece.Gate180, 0, true, 2)));
        db.Islands.Add(Island(other.Id, 0, wasted: true, new UtgardWallRecord(50, 0, 0, (int)PalisadePiece.Straight180, 0, false, 2)));
        await db.SaveChangesAsync(Ct);

        var index = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, Ct);

        var gate = new HexCoord(10, 0);
        Assert.True(index.IsWall(gate));
        Assert.False(index.IsWall(new HexCoord(50, 0)));
        Assert.False(index.ForOwner(Guid.NewGuid())!.FriendlyGate(gate));
    }
}
