using Bjarnoy.Domain.Economy;
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
                RiverTiles = [.. island.RiverTiles.Select(ToRiverTileRecord)],
            });
        }

        _dbContext.Worlds.Add(world);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (DbUpdateException)
        {
            // The AnyAsync check above is a courtesy, not a lock: two callers
            // racing to create a world with the same name both pass it, and
            // only the unique index on Name actually decides. Without this
            // catch the loser gets a raw 500 instead of the same
            // WorldCreationException (409) the earlier check already
            // promises — see SettlementService.FoundAsync's identical
            // PlotTaken race for the same reasoning.
            _dbContext.Entry(world).State = EntityState.Detached;
            throw new WorldCreationException($"A world named '{name}' already exists.");
        }

        _logger.LogInformation(
            "World {World} ({WorldId}) created with {Islands} islands and {Land} land hexes.",
            name, world.Id, generated.Islands.Count, generated.LandTileCount);

        return world;
    }

    /// <summary>
    /// Creates <paramref name="name"/> if — and only if — no world exists yet
    /// anywhere on this server. A no-op otherwise, including when
    /// <paramref name="name"/> specifically is already taken by something
    /// else (this is a bootstrap convenience, not a guarantee about that one
    /// name).
    /// </summary>
    /// <remarks>
    /// <para>
    /// Frontend clients no longer create a world themselves — see
    /// <c>docs/codebase-gap-analysis.md</c>, "world-creation race handled
    /// client-side by any anonymous visitor" — so a freshly migrated database
    /// (a first local run, a fresh CI database, a new environment) needs
    /// something to seed the one it now expects to simply find and join.
    /// Called unconditionally at startup (see <c>Program.cs</c>), the same
    /// way <c>AuthService.SeedAdminIfConfiguredAsync</c> seeds the first
    /// admin — except this one needs no configuration to opt into, since an
    /// empty server with literally no world to join is never a state anyone
    /// wants, unlike an unconfigured bootstrap admin.
    /// </para>
    /// <para>
    /// Race-safe the same way <see cref="CreateWorldAsync"/> already is: if
    /// two replicas start at once and both pass the emptiness check, only one
    /// insert wins and the other's resulting <see cref="WorldCreationException"/>
    /// is swallowed here rather than crashing that replica's startup.
    /// </para>
    /// </remarks>
    public async Task SeedDefaultWorldIfNoneAsync(
        string name, ILogger logger, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentNullException.ThrowIfNull(logger);

        if (await _dbContext.Worlds.AnyAsync(cancellationToken).ConfigureAwait(false))
        {
            return;
        }

        try
        {
            await CreateWorldAsync(
                name, WorldGenerationOptions.ForSeed(Random.Shared.Next()), maxPlayers: 500, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (WorldCreationException ex)
        {
            logger.LogInformation(
                ex, "Skipped seeding a default world — one already exists (likely another replica's race).");
        }
    }

    /// <summary>Worlds in creation order.</summary>
    /// <remarks>
    /// Ordered by id, not by <see cref="WorldEntity.CreatedAt"/>: ids are
    /// UUIDv7, so they already sort by creation time in both providers' storage
    /// forms, whereas SQLite cannot order by a <see cref="DateTimeOffset"/> at
    /// all (it has no native type for one).
    /// </remarks>
    public Task<List<WorldEntity>> GetWorldsAsync(CancellationToken cancellationToken = default) =>
        _dbContext.Worlds
            .AsNoTracking()
            .OrderBy(w => w.Id)
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

    /// <summary>
    /// Settlement count per world, i.e. player count: one settlement per player
    /// per world today (see <see cref="SettlementService.FoundAsync"/>).
    /// </summary>
    public async Task<Dictionary<Guid, int>> GetPlayerCountsAsync(CancellationToken cancellationToken = default) =>
        await _dbContext.Settlements
            .AsNoTracking()
            .GroupBy(s => s.WorldId)
            .Select(g => new { WorldId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.WorldId, x => x.Count, cancellationToken)
            .ConfigureAwait(false);

    public Task<int> GetPlayerCountAsync(Guid worldId, CancellationToken cancellationToken = default) =>
        _dbContext.Settlements.AsNoTracking().CountAsync(s => s.WorldId == worldId, cancellationToken);

    /// <summary>
    /// Updates a world's admin-controlled settings: speed factor, start date,
    /// stop-join toggle, endboss instant. Null fields are left unchanged.
    /// </summary>
    /// <remarks>
    /// Only the settings themselves are touched here — threading the speed
    /// factor through build/production math, and ticking a settlement's
    /// resources to "now" under the old factor before a change takes effect,
    /// lives in <c>Bjarnoy.Domain.Economy</c>, not here.
    /// </remarks>
    public async Task<WorldEntity?> UpdateAdminSettingsAsync(
        Guid worldId,
        double? speedFactor,
        bool hasStartsAt,
        DateTimeOffset? startsAt,
        bool? joinsClosed,
        bool hasEndbossAt,
        DateTimeOffset? endbossAt,
        CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);

        if (world is null)
        {
            return null;
        }

        if (speedFactor is { } factor)
        {
            world.SpeedFactor = factor;
        }

        if (hasStartsAt)
        {
            world.StartsAt = startsAt;
        }

        if (joinsClosed is { } closed)
        {
            world.JoinsClosed = closed;
        }

        if (hasEndbossAt)
        {
            world.EndbossAt = endbossAt;
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("World {WorldId} admin settings updated.", worldId);

        return world;
    }

    /// <summary>
    /// Transitions a world's <see cref="GameClock"/> state — the same machine
    /// <see cref="SettlementService.SetRunStateAsync"/> drives for the
    /// non-admin surface, exposed here too for the admin run-state endpoint.
    /// </summary>
    public async Task<WorldEntity?> SetRunStateAsync(
        Guid worldId,
        WorldRunState state,
        TimeSpan grace = default,
        CancellationToken cancellationToken = default)
    {
        var world = await _dbContext.Worlds
            .FirstOrDefaultAsync(w => w.Id == worldId, cancellationToken).ConfigureAwait(false);

        if (world is null)
        {
            return null;
        }

        var before = world.ToClock();
        var after = before.TransitionTo(state, _timeProvider.GetUtcNow(), grace);
        world.ApplyClock(after);

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation(
            "World {WorldId} moved from {From} to {To}; clock offset now {Offset}.",
            worldId, before.State, after.State, after.AccumulatedOffset);

        return world;
    }

    /// <summary>
    /// Fires the endboss for every world whose <see cref="WorldEntity.EndbossAt"/>
    /// has come and has not fired yet.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Called on a poll by <c>EndbossTriggerHostedService</c> rather than on any
    /// read path — everything else in this backend is lazy (see
    /// docs/tech/backend.md, "Everything is lazy"), but a world nobody happens
    /// to read would otherwise never trigger its endboss, so this one thing
    /// genuinely needs an active scan.
    /// </para>
    /// <para>
    /// <see cref="WorldEntity.EndbossTriggeredAt"/> is the idempotency marker:
    /// once set, a world is excluded from every later scan, so a slow poll
    /// interval or an overlapping run can never fire the same world twice.
    /// Joins are untouched — <see cref="WorldEntity.DetermineJoinability"/>
    /// does not look at this field, exactly as issue #27 specifies ("joins
    /// remain allowed" before and after).
    /// </para>
    /// <para>
    /// The actual endboss event is out of scope here (a follow-up issue): this
    /// only sets the marker and logs that it fired, which is enough for the
    /// admin/world DTOs to show it happened.
    /// </para>
    /// </remarks>
    /// <returns>The worlds whose endboss just fired.</returns>
    public async Task<IReadOnlyList<WorldEntity>> TriggerDueEndbossesAsync(
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow();

        var due = await _dbContext.Worlds
            .Where(w => w.EndbossAt.HasValue && !w.EndbossTriggeredAt.HasValue)
            .ToListAsync(cancellationToken).ConfigureAwait(false);
        due = [.. due.Where(w => w.EndbossAt!.Value <= now)];

        if (due.Count == 0)
        {
            return [];
        }

        foreach (var world in due)
        {
            world.EndbossTriggeredAt = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

        foreach (var world in due)
        {
            _logger.LogInformation(
                "World {WorldId} ({Name}) endboss triggered at {EndbossAt} (scanned at {Now}).",
                world.Id, world.Name, world.EndbossAt, now);
        }

        return due;
    }

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
                yield return new GeneratedTile(
                    coord,
                    sampler.TerrainAt(coord),
                    sampler.IsCoastalWater(coord),
                    sampler.OrientationAt(coord),
                    sampler.VariantAt(coord));
            }
        }
    }

    /// <summary>
    /// Most tiles one request may ask for. Roughly a 90x90 window, comfortably
    /// more than a screen at full zoom-out.
    /// </summary>
    public const int MaxTilesPerRequest = 8192;

    /// <summary>The domain's <see cref="RiverTile"/>, as the entity's plain-numeric <see cref="RiverTileRecord"/>.</summary>
    private static RiverTileRecord ToRiverTileRecord(RiverTile tile) => new(
        tile.Coord.Q,
        tile.Coord.R,
        (int)tile.Shape,
        [.. tile.InDirections.Select(d => (int)d)],
        tile.OutDirection is { } outDirection ? (int)outDirection : null);
}
