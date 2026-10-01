using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.World;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using SkiaSharp;

namespace Bjarnoy.Infrastructure.Tests.World;

public class FogChunkServiceTests : IDisposable
{
    private readonly SqliteConnection _connection = new("DataSource=:memory:");
    private readonly GameDbContext _dbContext;
    private readonly IMemoryCache _cache = new MemoryCache(new MemoryCacheOptions());

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public FogChunkServiceTests()
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
    }

    private FogChunkService NewService() => new(_dbContext, _cache, TimeProvider.System);

    private Guid AddWorld(int radius)
    {
        var worldId = Guid.NewGuid();
        _dbContext.Worlds.Add(new WorldEntity { Id = worldId, Name = "Test", Radius = radius });
        _dbContext.Islands.Add(new IslandEntity { Id = IslandFor(worldId), WorldId = worldId, Name = "Home Isle" });
        return worldId;
    }

    private static Guid IslandFor(Guid worldId) => worldId; // one island per test world; same id keeps helpers stateless

    private SettlementEntity AddSettlement(
        Guid worldId, string ownerId, int q, int r, int level, params (int Q, int R, int Level)[] towers)
    {
        var buildings = new List<PlacedBuildingEntity>
        {
            new() { Q = q, R = r, Type = BuildingType.Longhouse, Level = level },
        };
        buildings.AddRange(towers.Select(t => new PlacedBuildingEntity
        {
            Q = t.Q, R = t.R, Type = BuildingType.Tower, Level = t.Level,
        }));

        var settlement = new SettlementEntity
        {
            Id = Guid.NewGuid(),
            WorldId = worldId,
            IslandId = IslandFor(worldId),
            UserId = SystemUserIds.Abandoned,
            Name = "Home",
            OwnerName = ownerId,
            OwnerId = ownerId,
            CentreQ = q,
            CentreR = r,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = buildings,
        };
        _dbContext.Settlements.Add(settlement);
        return settlement;
    }

    /// <summary>The whole world's chunk rectangle.</summary>
    private async Task<FogChunksResult> GetWorldAsync(Guid worldId, string ownerId, int radius)
    {
        var (min, max) = FogChunkLayout.WorldChunkRange(radius);
        return await NewService().GetChunksAsync(worldId, ownerId, min.U, max.U, min.V, max.V, Ct);
    }

    private static FogChunk ChunkAt(FogChunksResult result, FogChunkCoord coord) =>
        result.Chunks!.Single(c => c.Coord == coord);

    /// <summary>The mask cell at <paramref name="texel"/>, read back from the delivered chunk PNG (an empty chunk is fully unknown).</summary>
    private static FogMaskCell CellAt(FogChunksResult result, MaskTexel texel)
    {
        var chunk = ChunkAt(result, FogChunkLayout.ChunkOf(texel));
        if (chunk.Png is null)
        {
            return new FogMaskCell(255, 255, 0);
        }

        using var bitmap = SKBitmap.Decode(chunk.Png);
        var bounds = FogChunkLayout.Bounds(chunk.Coord);
        Assert.Equal(FogChunkLayout.ChunkSize, bitmap.Width);
        Assert.Equal(FogChunkLayout.ChunkSize, bitmap.Height);
        var pixel = bitmap.GetPixel(texel.U - bounds.MinU, texel.V - bounds.MinV);
        return new FogMaskCell(pixel.Red, pixel.Green, pixel.Blue);
    }

    [Fact]
    public async Task Rejects_an_unknown_world()
    {
        var result = await NewService().GetChunksAsync(Guid.NewGuid(), "player-1", 0, 0, 0, 0, Ct);

        Assert.Equal(FogChunkRejection.WorldNotFound, result.Rejection);
        Assert.False(result.Accepted);
    }

    [Fact]
    public async Task Rejects_an_inverted_rectangle_and_one_over_the_chunk_cap()
    {
        var worldId = AddWorld(6);
        await _dbContext.SaveChangesAsync(Ct);

        var inverted = await NewService().GetChunksAsync(worldId, "player-1", 1, 0, 0, 0, Ct);
        var tooMany = await NewService().GetChunksAsync(worldId, "player-1", 0, 16, 0, 16, Ct); // 17 x 17 = 289 > 256

        Assert.Equal(FogChunkRejection.InvalidRange, inverted.Rejection);
        Assert.Equal(FogChunkRejection.TooManyChunks, tooMany.Rejection);

        var atCap = await NewService().GetChunksAsync(worldId, "player-1", 0, 15, 0, 15, Ct); // 16 x 16 = 256
        Assert.True(atCap.Accepted);
        Assert.Equal(FogChunkService.MaxChunksPerRequest, atCap.Chunks!.Count);
    }

    [Fact]
    public async Task Delivers_every_requested_chunk_row_major_and_a_player_with_nothing_gets_them_all_empty()
    {
        var worldId = AddWorld(40);
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 40);

        var (min, max) = FogChunkLayout.WorldChunkRange(40);
        var expected = new List<FogChunkCoord>();
        for (var cv = min.V; cv <= max.V; cv++)
        {
            for (var cu = min.U; cu <= max.U; cu++)
            {
                expected.Add(new FogChunkCoord(cu, cv));
            }
        }

        Assert.Equal(expected, result.Chunks!.Select(c => c.Coord));
        Assert.All(result.Chunks!, c =>
        {
            Assert.Null(c.Png);
            Assert.Equal(FogChunkService.EmptyVersion, c.Version);
        });
        Assert.False(await _dbContext.PlayerExploredChunks.AnyAsync(Ct));
    }

    [Fact]
    public async Task Bakes_a_decodable_chunk_lit_up_around_the_players_own_settlement()
    {
        var worldId = AddWorld(6);
        AddSettlement(worldId, "player-1", 0, 0, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 6);

        Assert.True(result.Accepted);
        var cell = CellAt(result, FogMaskLayout.ToTexel(HexCoord.Origin));

        // At the settlement's own centre, both ramps must read fully revealed.
        Assert.Equal(0, cell.Unknown);
        Assert.Equal(0, cell.OutOfSight);
        Assert.NotNull(ChunkAt(result, FogChunkLayout.ChunkOf(HexCoord.Origin)).Png);
    }

    [Fact]
    public async Task Excludes_another_players_settlements()
    {
        var worldId = AddWorld(6);
        // Same ground, a second player without an Odin Statue — the control.
        AddSettlement(worldId, "player-2", 0, 1, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 6);

        // Nothing of player-1's own is here: no chunk is even generated.
        Assert.All(result.Chunks!, c => Assert.Null(c.Png));
        Assert.Equal(255, CellAt(result, FogMaskLayout.ToTexel(HexCoord.Origin)).Unknown);
    }

    [Fact]
    public async Task The_chunks_the_service_delivers_stitch_back_into_exactly_the_whole_world_mask()
    {
        // The end-to-end seam proof: service output (DB -> sources -> halo ->
        // per-chunk bake -> PNG -> decode) against the reference whole-world
        // Generate over the same inputs.
        const int radius = 40;
        var worldId = AddWorld(radius);
        AddSettlement(worldId, "player-1", 0, 0, level: 3, towers: (-1, 31, 2));
        AddSettlement(worldId, "player-1", -30, 5, level: 1);
        AddSettlement(worldId, "player-1", 33, -3, level: 2);
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", radius);

        var sources = new List<FogVisionSource>
        {
            FogVisionRadii.ToVisionSource(new HexCoord(0, 0), 3),
            FogVisionRadii.ToTowerVisionSource(new HexCoord(-1, 31), 2),
            FogVisionRadii.ToVisionSource(new HexCoord(-30, 5), 1),
            FogVisionRadii.ToVisionSource(new HexCoord(33, -3), 2),
        };
        var explored = sources
            .SelectMany(s => s.Coord.WithinRadius(s.ExploredRadius))
            .ToHashSet();
        var worldBounds = FogMaskLayout.WorldBounds(radius);
        var whole = FogMaskGenerator.Generate(worldBounds, sources, explored);

        var multiChunk = result.Chunks!.Count(c => c.Png is not null);
        Assert.True(multiChunk >= 3, $"the world must exercise several generated chunks, got {multiChunk}");

        var compared = 0;
        for (var v = worldBounds.MinV + 1; v <= worldBounds.MaxV - 2; v++)
        {
            for (var u = worldBounds.MinU + 1; u <= worldBounds.MaxU - 2; u++)
            {
                var texel = new MaskTexel(u, v);
                var expected = whole[texel];
                var actual = CellAt(result, texel);

                // An empty chunk carries no noise seed: the shader never reads it there (ramp saturated).
                Assert.Equal(expected.Unknown, actual.Unknown);
                Assert.Equal(expected.OutOfSight, actual.OutOfSight);
                if (ChunkAt(result, FogChunkLayout.ChunkOf(texel)).Png is not null)
                {
                    Assert.Equal(expected.NoiseSeed, actual.NoiseSeed);
                }

                compared++;
            }
        }

        Assert.Equal(((2 * radius) + 1) * ((4 * radius) + 1), compared);
    }

    [Fact]
    public async Task Caches_each_chunk_and_a_settlement_change_only_dirties_the_chunks_near_it()
    {
        const int radius = 150;
        var worldId = AddWorld(radius);
        var home = AddSettlement(worldId, "player-1", 0, 0, level: 1);
        var farAway = new HexCoord(-140, 70);
        AddSettlement(worldId, "player-1", farAway.Q, farAway.R, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        var first = await GetWorldAsync(worldId, "player-1", radius);
        var second = await GetWorldAsync(worldId, "player-1", radius);

        var homeChunk = FogChunkLayout.ChunkOf(HexCoord.Origin);
        var farChunk = FogChunkLayout.ChunkOf(farAway);
        Assert.NotEqual(homeChunk, farChunk);

        // Nothing changed: same ETag, and the bytes come back from cache —
        // same reference, not merely equal content, proves the cache hit.
        Assert.Equal(first.ETag, second.ETag);
        Assert.Same(ChunkAt(first, homeChunk).Png, ChunkAt(second, homeChunk).Png);
        Assert.Same(ChunkAt(first, farChunk).Png, ChunkAt(second, farChunk).Png);

        home.Buildings[0].Level = 8;
        await _dbContext.SaveChangesAsync(Ct);
        var third = await GetWorldAsync(worldId, "player-1", radius);

        // The home longhouse levelled up: its chunk's version bumps and the
        // stale cache entry is not served ...
        Assert.NotEqual(first.ETag, third.ETag);
        Assert.NotEqual(ChunkAt(first, homeChunk).Version, ChunkAt(third, homeChunk).Version);
        Assert.NotSame(ChunkAt(first, homeChunk).Png, ChunkAt(third, homeChunk).Png);

        // ... while a chunk out of that settlement's reach keeps both its
        // version and its cached bytes: the change cost nothing there.
        Assert.Equal(ChunkAt(first, farChunk).Version, ChunkAt(third, farChunk).Version);
        Assert.Same(ChunkAt(first, farChunk).Png, ChunkAt(third, farChunk).Png);
    }

    [Fact]
    public async Task Persisted_history_survives_the_settlement_that_explored_it_being_lost()
    {
        var worldId = AddWorld(8);
        // Level 6 -> ExploredRadius(6) = 2 + 6/2 + 3 = 8, reaching (8, 0).
        var settlement = AddSettlement(worldId, "player-1", 0, 0, level: 6);
        await _dbContext.SaveChangesAsync(Ct);

        await GetWorldAsync(worldId, "player-1", 8);

        // The settlement is gone entirely (abandoned/razed) — a fresh call
        // must still show the ground it once scouted as explored, because
        // §1e's whole point is that history outlives the source.
        _dbContext.Settlements.Remove(settlement);
        await _dbContext.SaveChangesAsync(Ct);

        var afterLoss = await GetWorldAsync(worldId, "player-1", 8);

        Assert.True(afterLoss.Accepted);
        Assert.Equal(0, CellAt(afterLoss, FogMaskLayout.ToTexel(new HexCoord(8, 0))).Unknown);
    }

    [Fact]
    public async Task Odins_ravens_widen_the_settlements_own_explored_and_visible_rings()
    {
        var worldId = AddWorld(30);
        // Level 1: ExploredRadius 5, VisibleRadius 3 (border 2). An Odin Statue at level 3 adds 6 rings.
        var settlement = AddSettlement(worldId, "player-1", 0, 0, level: 1);
        // Same ground, a second player without an Odin Statue — the control.
        AddSettlement(worldId, "player-2", 0, 1, level: 1);
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.OdinStatue, Level = 3 });
        await _dbContext.SaveChangesAsync(Ct);

        var withOdin = await GetWorldAsync(worldId, "player-1", 30);
        var without = await GetWorldAsync(worldId, "player-2", 30);

        var edge = FogMaskLayout.ToTexel(new HexCoord(11, 0)); // 5 + 6 = 11 rings out
        var beyond = FogMaskLayout.ToTexel(new HexCoord(28, 0)); // past 11 + the 14-ring fade
        Assert.NotEqual(0, CellAt(without, edge).Unknown);
        Assert.Equal(0, CellAt(withOdin, edge).Unknown);
        Assert.Equal(255, CellAt(withOdin, beyond).Unknown);
        // Line of sight grew too: 3 + 6 = 9 rings out is no longer out of sight.
        var seen = FogMaskLayout.ToTexel(new HexCoord(9, 0));
        Assert.Equal(255, CellAt(without, seen).OutOfSight);
        Assert.Equal(0, CellAt(withOdin, seen).OutOfSight);
    }

    [Fact]
    public async Task An_unfinished_odin_statue_widens_nothing()
    {
        var worldId = AddWorld(30);
        var settlement = AddSettlement(worldId, "player-1", 0, 0, level: 1);
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.OdinStatue, Level = 0 });
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 30);

        Assert.NotEqual(0, CellAt(result, FogMaskLayout.ToTexel(new HexCoord(11, 0))).Unknown);
    }

    [Fact]
    public async Task Odins_ravens_widen_what_a_travelling_army_explores()
    {
        var worldId = AddWorld(40);
        var settlement = AddSettlement(worldId, "player-1", 0, 0, level: 1);
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.OdinStatue, Level = 5 });
        // The army stands at (20, 0), far outside the settlement's own (5 + 10 = 15) explored ring.
        _dbContext.Armies.Add(new ArmyEntity
        {
            SettlementId = settlement.Id,
            Settlement = settlement,
            AtHome = false,
            IsSupporting = false,
            DepartedAt = DateTimeOffset.UnixEpoch,
            Path = [new HexPoint(20, 0)],
            CumulativeHours = [0],
            ReturnPath = [new HexPoint(20, 0), new HexPoint(0, 0)],
            ReturnCumulativeHours = [0, 1],
            TurnAroundAt = DateTimeOffset.UnixEpoch.AddDays(3650),
            IsReturning = false,
        });
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 40);

        // Base army vision is 2 rings; Ravens at level 5 make it 12. (28, 0) is 8 rings from the
        // army and 28 from the settlement: only the widened army reveal explains it.
        Assert.Equal(0, CellAt(result, FogMaskLayout.ToTexel(new HexCoord(28, 0))).Unknown);
        Assert.Equal(0, CellAt(result, FogMaskLayout.ToTexel(new HexCoord(31, 0))).Unknown);
        Assert.NotEqual(0, CellAt(result, FogMaskLayout.ToTexel(new HexCoord(37, 0))).Unknown);
    }

    [Fact]
    public async Task An_in_transit_armys_walked_ground_becomes_persisted_history()
    {
        var worldId = AddWorld(10);
        var settlement = AddSettlement(worldId, "player-1", 0, 0, level: 1);

        // Far out on a one-hex "leg" that's long since been reached, so the
        // position is (9, 0) whenever "now" is evaluated. Level-1
        // ExploredRadius is 6, so (9, 0) is outside the settlement's own
        // ring — only the army's walked-ground contribution explains it.
        _dbContext.Armies.Add(new ArmyEntity
        {
            SettlementId = settlement.Id,
            Settlement = settlement,
            AtHome = false,
            IsSupporting = false,
            DepartedAt = DateTimeOffset.UnixEpoch,
            Path = [new HexPoint(9, 0)],
            CumulativeHours = [0],
            ReturnPath = [new HexPoint(9, 0), new HexPoint(0, 0)],
            ReturnCumulativeHours = [0, 1],
            TurnAroundAt = DateTimeOffset.UnixEpoch.AddDays(3650),
            IsReturning = false,
        });
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 10);

        Assert.Equal(0, CellAt(result, FogMaskLayout.ToTexel(new HexCoord(9, 0))).Unknown);

        // Really persisted, not just "currently in range of a live source".
        var army = new HexCoord(9, 0);
        var chunk = FogChunkLayout.ChunkOf(army);
        var stored = await _dbContext.PlayerExploredChunks.SingleAsync(
            e => e.WorldId == worldId && e.OwnerId == "player-1" && e.ChunkU == chunk.U && e.ChunkV == chunk.V, Ct);
        Assert.Contains(army, PersistedExploredBitset.Decode(chunk, new ExploredChunkData(stored.Bits, stored.IsFull)));
    }

    [Fact]
    public async Task Etag_and_bytes_are_stable_across_calls_when_nothing_new_was_explored()
    {
        var worldId = AddWorld(6);
        AddSettlement(worldId, "player-1", 0, 0, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        var first = await GetWorldAsync(worldId, "player-1", 6);
        var rowsAfterFirst = await _dbContext.PlayerExploredChunks.CountAsync(Ct);
        var second = await GetWorldAsync(worldId, "player-1", 6);

        // The ring was fully OR-ed in on the first call — the persisted
        // layer's own contribution must not force a bump on its own, and
        // the second call writes nothing.
        Assert.Equal(first.ETag, second.ETag);
        Assert.Equal(rowsAfterFirst, await _dbContext.PlayerExploredChunks.CountAsync(Ct));
        var originChunk = FogChunkLayout.ChunkOf(HexCoord.Origin);
        Assert.Same(ChunkAt(first, originChunk).Png, ChunkAt(second, originChunk).Png);
    }

    [Fact]
    public async Task Stores_only_the_chunks_a_player_touched_and_never_a_whole_world_row()
    {
        var worldId = AddWorld(150);
        AddSettlement(worldId, "player-1", 0, 0, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        await GetWorldAsync(worldId, "player-1", 150);

        var rows = await _dbContext.PlayerExploredChunks.ToListAsync(Ct);
        var (min, max) = FogChunkLayout.WorldChunkRange(150);
        var worldChunks = (max.U - min.U + 1) * (max.V - min.V + 1);

        Assert.NotEmpty(rows);
        // A radius-6 ring straddles at most a 2 x 2 block of chunks.
        Assert.InRange(rows.Count, 1, 4);
        Assert.True(rows.Count < worldChunks / 10);
        Assert.All(rows, r => Assert.Equal(PersistedExploredBitset.ByteCount, r.Bits!.Length));
    }

    [Fact]
    public async Task A_chunk_completed_by_the_players_rings_is_promoted_to_full_and_drops_its_bits()
    {
        var worldId = AddWorld(60);
        var chunk = new FogChunkCoord(0, 0);

        // Chunk (0, 0) explored except for the origin hex, stored as a bitset.
        var almost = new HashSet<HexCoord>();
        var bounds = FogChunkLayout.Bounds(chunk);
        for (var v = bounds.MinV; v < bounds.MaxV; v++)
        {
            for (var u = bounds.MinU; u < bounds.MaxU; u++)
            {
                var texel = new MaskTexel(u, v);
                if (FogMaskLayout.IsHexTexel(texel) && texel != FogMaskLayout.ToTexel(HexCoord.Origin))
                {
                    almost.Add(FogMaskLayout.ToHex(texel));
                }
            }
        }

        var data = PersistedExploredBitset.Encode(chunk, almost);
        Assert.False(data.IsFull);
        _dbContext.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
        {
            WorldId = worldId, OwnerId = "player-1", ChunkU = chunk.U, ChunkV = chunk.V, Bits = data.Bits,
        });
        AddSettlement(worldId, "player-1", 0, 0, level: 1); // its ring covers the missing origin
        await _dbContext.SaveChangesAsync(Ct);

        var result = await GetWorldAsync(worldId, "player-1", 60);

        var row = await _dbContext.PlayerExploredChunks.AsNoTracking()
            .SingleAsync(e => e.WorldId == worldId && e.ChunkU == 0 && e.ChunkV == 0, Ct);
        Assert.True(row.IsFull);
        Assert.Null(row.Bits);

        // And a full chunk reads explored far from any source: hex (40, 10)
        // is texel (40, 60) (v = 2r + q), 40 hexes from the level-1 ring.
        var farHex = new HexCoord(40, 10);
        Assert.Equal(chunk, FogChunkLayout.ChunkOf(farHex));
        Assert.Equal(0, CellAt(result, FogMaskLayout.ToTexel(farHex)).Unknown);
    }

    [Fact]
    public async Task A_full_chunk_row_is_left_alone_by_later_merges()
    {
        var worldId = AddWorld(60);
        _dbContext.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
        {
            WorldId = worldId, OwnerId = "player-1", ChunkU = 0, ChunkV = 0, Bits = null, IsFull = true,
        });
        AddSettlement(worldId, "player-1", 0, 0, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        await GetWorldAsync(worldId, "player-1", 60);

        var row = await _dbContext.PlayerExploredChunks.AsNoTracking()
            .SingleAsync(e => e.WorldId == worldId && e.ChunkU == 0 && e.ChunkV == 0, Ct);
        Assert.True(row.IsFull);
        Assert.Null(row.Bits);
    }

    [Fact]
    public async Task Chunks_outside_the_world_are_empty_and_never_touch_the_database_rows()
    {
        var worldId = AddWorld(6);
        AddSettlement(worldId, "player-1", 0, 0, level: 1);
        await _dbContext.SaveChangesAsync(Ct);

        var result = await NewService().GetChunksAsync(worldId, "player-1", 50, 51, 50, 51, Ct);

        Assert.True(result.Accepted);
        Assert.All(result.Chunks!, c => Assert.Null(c.Png));
    }

    [Fact]
    public async Task Explored_among_answers_from_current_discs_and_stored_chunks_only_for_the_owner()
    {
        var worldId = AddWorld(150);
        AddSettlement(worldId, "player-1", 0, 0, level: 1);
        var oldGround = new HexCoord(-100, 40); // explored once, nothing there now
        var oldChunk = FogChunkLayout.ChunkOf(oldGround);
        var oldData = PersistedExploredBitset.Encode(oldChunk, [oldGround]);
        _dbContext.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
        {
            WorldId = worldId, OwnerId = "player-1", ChunkU = oldChunk.U, ChunkV = oldChunk.V, Bits = oldData.Bits,
        });
        _dbContext.PlayerExploredChunks.Add(new PlayerExploredChunkEntity
        {
            WorldId = worldId, OwnerId = "player-2", ChunkU = oldChunk.U, ChunkV = oldChunk.V, Bits = oldData.Bits,
        });
        await _dbContext.SaveChangesAsync(Ct);

        var exploredArea = new ExploredAreaService(_dbContext, TimeProvider.System);
        var area = await exploredArea.GetAsync(worldId, "player-1", persist: false, Ct);
        var neverSeen = new HexCoord(100, -40);
        var next = new HexCoord(-99, 40); // same chunk as oldGround, but a different hex

        var explored = await exploredArea.ExploredAmongAsync(
            area!, [HexCoord.Origin, new HexCoord(3, 0), oldGround, neverSeen, next], Ct);

        Assert.Equal(new HashSet<HexCoord> { HexCoord.Origin, new(3, 0), oldGround }, explored);

        // The fog-gated reads must not write: nothing persisted for the ring.
        Assert.Equal(2, await _dbContext.PlayerExploredChunks.CountAsync(Ct));
    }
}
