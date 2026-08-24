using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>Raised when a world cannot be created as asked.</summary>
public sealed class WorldCreationException(string message) : Exception(message);

/// <summary>
/// Creates and reads worlds: runs the generator, stores what the client cannot
/// derive, and answers terrain queries from the stored seed.
/// </summary>
public sealed class WorldService(
    GameDbContext dbContext,
    TimeProvider timeProvider,
    ILogger<WorldService> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<WorldService> _logger = logger;

    /// <summary>
    /// Generates a world and persists it: the seed and its parameters, plus the
    /// islands the flood fill found and the plots players can be founded on.
    /// </summary>
    public async Task<WorldEntity> CreateWorldAsync(
        string name,
        WorldGenerationOptions options,
        int maxPlayers,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxPlayers);

        options.Validate();

        if (await _dbContext.Worlds.AnyAsync(w => w.Name == name, cancellationToken).ConfigureAwait(false))
        {
            throw new WorldCreationException($"A world named '{name}' already exists.");
        }

        _logger.LogInformation(
            "Generating world {World} from seed {Seed} at radius {Radius}.",
            name, options.Seed, options.Radius);

        // Generation is CPU-bound and can take a while for a large radius, so it
        // runs off the request thread.
        var generated = await Task.Run(
            () => new WorldGenerator(options).Generate(cancellationToken),
            cancellationToken).ConfigureAwait(false);

        if (generated.Islands.Count == 0)
        {
            throw new WorldCreationException(
                $"Seed {options.Seed} at radius {options.Radius} produced no islands. " +
                "Try another seed or a larger radius.");
        }

        var world = new WorldEntity
        {
            Name = name,
            MaxPlayers = maxPlayers,
            CreatedAt = _timeProvider.GetUtcNow(),
        };
        world.ApplyGenerationOptions(options);

        foreach (var island in generated.Islands)
        {
            world.Islands.Add(new IslandEntity
            {
                WorldId = world.Id,
                Index = island.Index,
                Name = island.Name,
                CentreQ = island.Centre.Q,
                CentreR = island.Centre.R,
                TileCount = island.TileCount,
                StartPositions = [.. island.StartPositions.Select(p => new HexPoint(p.Q, p.R))],
            });
        }

        _dbContext.Worlds.Add(world);
        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "World {World} ({WorldId}) created with {Islands} islands and {Land} land hexes.",
            name, world.Id, generated.Islands.Count, generated.LandTileCount);

        return world;
    }

    public Task<List<WorldEntity>> GetWorldsAsync(CancellationToken cancellationToken = default) =>
        _dbContext.Worlds
            .AsNoTracking()
            .OrderBy(w => w.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<WorldEntity?> GetWorldAsync(Guid id, CancellationToken cancellationToken = default) =>
        _dbContext.Worlds
            .AsNoTracking()
            .FirstOrDefaultAsync(w => w.Id == id, cancellationToken);

    /// <summary>Island count per world, for listing worlds without loading their islands.</summary>
    public async Task<Dictionary<Guid, int>> GetIslandCountsAsync(CancellationToken cancellationToken = default) =>
        await _dbContext.Islands
            .AsNoTracking()
            .GroupBy(i => i.WorldId)
            .Select(g => new { WorldId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.WorldId, x => x.Count, cancellationToken)
            .ConfigureAwait(false);

    public Task<int> GetIslandCountAsync(Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Islands.AsNoTracking().CountAsync(i => i.WorldId == worldId, cancellationToken);

    public Task<List<IslandEntity>> GetIslandsAsync(Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Islands
            .AsNoTracking()
            .Where(i => i.WorldId == worldId)
            .OrderBy(i => i.Index)
            .ToListAsync(cancellationToken);

    /// <summary>
    /// The terrain of an axial rectangle, derived from the world's seed rather
    /// than read from a table.
    /// </summary>
    /// <remarks>
    /// The caller is expected to bound the rectangle; <see cref="MaxTilesPerRequest"/>
    /// is the ceiling a request may ask for.
    /// </remarks>
    public static IEnumerable<GeneratedTile> GetTiles(
        WorldEntity world,
        int qMin,
        int qMax,
        int rMin,
        int rMax)
    {
        ArgumentNullException.ThrowIfNull(world);

        var sampler = new TerrainSampler(world.ToGenerationOptions());

        for (var q = qMin; q <= qMax; q++)
        {
            for (var r = rMin; r <= rMax; r++)
            {
                var coord = new HexCoord(q, r);
                yield return new GeneratedTile(coord, sampler.TerrainAt(coord));
            }
        }
    }

    /// <summary>
    /// Most tiles one request may ask for. Roughly a 90x90 window, comfortably
    /// more than a screen at full zoom-out.
    /// </summary>
    public const int MaxTilesPerRequest = 8192;
}
