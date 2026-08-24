using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Infrastructure.Persistence;

/// <summary>The applied and pending migrations of a database.</summary>
/// <param name="Reachable">
/// Whether the database answered. False covers both "not created yet" and "not
/// running": the two are indistinguishable from a connection attempt, and both
/// mean the same thing to a deploy — migrate before starting.
/// </param>
public sealed record MigrationStatus(
    bool Reachable,
    string ProviderName,
    IReadOnlyList<string> Applied,
    IReadOnlyList<string> Pending)
{
    public bool IsUpToDate => Reachable && Pending.Count == 0;
}

/// <summary>
/// Brings the schema forward. Exposed as a CLI mode of the API host
/// (<c>Bjarnoy.Api --migrate</c>) so a deployment can migrate with the image it
/// is about to roll out, before the new containers take over.
/// </summary>
/// <remarks>
/// This replaces the legacy <c>DatabaseMigrator</c>, which scanned a directory
/// of .sql files at a path resolved relative to the executing assembly — empty
/// under a single-file publish — and which nothing in the application ever
/// called; production migrations were run by the Atlas CLI against the same
/// directory, leaving two engines over one set of files.
/// </remarks>
public sealed class DatabaseMigrator(GameDbContext dbContext, ILogger<DatabaseMigrator> logger)
{
    private readonly GameDbContext _dbContext = dbContext;
    private readonly ILogger<DatabaseMigrator> _logger = logger;

    public async Task<MigrationStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var providerName = _dbContext.Database.ProviderName ?? "unknown";

        var reachable = false;
        try
        {
            reachable = await _dbContext.Database.CanConnectAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "Could not connect to the database while reading migration status.");
        }

        if (!reachable)
        {
            // A database that does not exist yet is not an error: everything the
            // migrations assembly knows about is simply pending. GetMigrations
            // reads the assembly, so it needs no connection.
            var all = _dbContext.Database.GetMigrations().ToList();
            return new MigrationStatus(false, providerName, [], all);
        }

        var applied = (await _dbContext.Database
            .GetAppliedMigrationsAsync(cancellationToken).ConfigureAwait(false)).ToList();
        var pending = (await _dbContext.Database
            .GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).ToList();

        return new MigrationStatus(true, providerName, applied, pending);
    }

    /// <summary>
    /// Applies every pending migration. Safe to run when there is nothing to do,
    /// and safe to run concurrently: EF takes a database lock for the duration,
    /// so a second runner waits rather than double-applying.
    /// </summary>
    /// <returns>The migrations this call applied.</returns>
    public async Task<IReadOnlyList<string>> MigrateAsync(CancellationToken cancellationToken = default)
    {
        var pending = (await _dbContext.Database
            .GetPendingMigrationsAsync(cancellationToken).ConfigureAwait(false)).ToList();

        if (pending.Count == 0)
        {
            _logger.LogInformation("Database is up to date; no migrations to apply.");
            return [];
        }

        _logger.LogInformation(
            "Applying {Count} migration(s): {Migrations}", pending.Count, string.Join(", ", pending));

        await _dbContext.Database.MigrateAsync(cancellationToken).ConfigureAwait(false);

        _logger.LogInformation("Applied {Count} migration(s).", pending.Count);
        return pending;
    }

    /// <summary>
    /// The SQL a <see cref="MigrateAsync"/> call would run, without running it.
    /// </summary>
    public string GetPendingScript(MigrationStatus status)
    {
        ArgumentNullException.ThrowIfNull(status);

        if (status.Pending.Count == 0)
        {
            return string.Empty;
        }

        var migrator = _dbContext.Database.GetService<IMigrator>();

        // "0" is EF's name for the empty database, i.e. script everything.
        var from = status.Applied.Count > 0 ? status.Applied[^1] : "0";
        return migrator.GenerateScript(fromMigration: from, toMigration: status.Pending[^1]);
    }
}
