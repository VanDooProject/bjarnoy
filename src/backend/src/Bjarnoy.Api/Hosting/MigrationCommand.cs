using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>What the caller asked the process to do on the command line.</summary>
public enum MigrationCommandKind
{
    /// <summary>No migration flag; run the web application.</summary>
    None,

    /// <summary>Apply pending migrations, then exit.</summary>
    Apply,

    /// <summary>
    /// Apply pending migrations, seed the default world if the database has
    /// none, then exit.
    /// </summary>
    ApplySeed,

    /// <summary>Report applied and pending migrations, then exit.</summary>
    Status,

    /// <summary>Print the SQL that would be applied, then exit.</summary>
    Script,
}

/// <summary>
/// The migrator, exposed as a mode of the API executable.
/// </summary>
/// <remarks>
/// <para>
/// A deployment runs <c>dotnet Bjarnoy.Api.dll --migrate</c> as its own step —
/// a Kubernetes Job, a Compose one-shot, an init container — using the very
/// image it is about to roll out, and only replaces the running containers once
/// that step exits 0. Carrying the migrator in the same image is what keeps the
/// schema and the code that expects it in lockstep.
/// </para>
/// <para>
/// The legacy backend had the pieces but not this property: its C# migrator was
/// only ever called from tests, while production migrations ran from a separate
/// Atlas CLI in the pipeline.
/// </para>
/// </remarks>
public static class MigrationCommand
{
    /// <summary>Exit code for "there were pending migrations", used by <c>--migrate-status</c>.</summary>
    public const int PendingExitCode = 2;

    /// <summary>Exit code for a migration that failed to apply.</summary>
    public const int FailureExitCode = 1;

    /// <summary>
    /// The world <c>--seed</c> creates. Shared with the self-migrating startup
    /// path in <c>Program.cs</c> so the two cannot name it differently.
    /// </summary>
    public const string DefaultWorldName = "Kettil Sea";

    public static MigrationCommandKind Parse(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);

        // The first migration flag still wins, so an existing `--migrate` keeps
        // meaning exactly what it did. `--seed` is a modifier rather than a mode
        // of its own: seeding needs a schema, and applying is idempotent, so
        // `--seed` on its own means the same as `--migrate --seed`.
        var kind = MigrationCommandKind.None;
        var seed = false;

        foreach (var arg in args)
        {
            switch (arg)
            {
                case "--seed" or "seed":
                    seed = true;
                    break;
                case "--migrate" or "migrate":
                    kind = kind is MigrationCommandKind.None ? MigrationCommandKind.Apply : kind;
                    break;
                case "--migrate-status" or "migrate-status":
                    kind = kind is MigrationCommandKind.None ? MigrationCommandKind.Status : kind;
                    break;
                case "--migrate-script" or "migrate-script":
                    kind = kind is MigrationCommandKind.None ? MigrationCommandKind.Script : kind;
                    break;
                default:
                    continue;
            }
        }

        // --migrate-status/--migrate-script report rather than change anything,
        // so seeding alongside them would contradict what they are for.
        if (seed && kind is MigrationCommandKind.None or MigrationCommandKind.Apply)
        {
            return MigrationCommandKind.ApplySeed;
        }

        return kind;
    }

    /// <summary>
    /// Runs the requested migration command against the host's services and
    /// returns the process exit code.
    /// </summary>
    public static async Task<int> RunAsync(
        IServiceProvider services,
        MigrationCommandKind kind,
        TextWriter output,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(output);

        await using var scope = services.CreateAsyncScope();
        var migrator = scope.ServiceProvider.GetRequiredService<DatabaseMigrator>();

        try
        {
            switch (kind)
            {
                case MigrationCommandKind.Apply:
                    return await ApplyAsync(migrator, output, cancellationToken).ConfigureAwait(false);

                case MigrationCommandKind.ApplySeed:
                    var applyExitCode = await ApplyAsync(migrator, output, cancellationToken)
                        .ConfigureAwait(false);
                    if (applyExitCode != 0)
                    {
                        return applyExitCode;
                    }

                    return await SeedAsync(scope.ServiceProvider, output, cancellationToken)
                        .ConfigureAwait(false);

                case MigrationCommandKind.Status:
                    return await ReportStatusAsync(migrator, output, cancellationToken).ConfigureAwait(false);

                case MigrationCommandKind.Script:
                    return await WriteScriptAsync(migrator, output, cancellationToken).ConfigureAwait(false);

                default:
                    throw new ArgumentOutOfRangeException(nameof(kind), kind, "Not a migration command.");
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            await output.WriteLineAsync($"Migration failed: {ex.Message}").ConfigureAwait(false);
            return FailureExitCode;
        }
    }

    private static async Task<int> ApplyAsync(
        DatabaseMigrator migrator,
        TextWriter output,
        CancellationToken cancellationToken)
    {
        var applied = await migrator.MigrateAsync(cancellationToken).ConfigureAwait(false);

        if (applied.Count == 0)
        {
            await output.WriteLineAsync("Database is up to date.").ConfigureAwait(false);
            return 0;
        }

        await output.WriteLineAsync($"Applied {applied.Count} migration(s):").ConfigureAwait(false);
        foreach (var migration in applied)
        {
            await output.WriteLineAsync($"  {migration}").ConfigureAwait(false);
        }

        return 0;
    }

    /// <summary>
    /// Gives a freshly migrated database the one world a deployment needs to be
    /// playable. The app itself only seeds when it migrates in-process
    /// (<c>Database:MigrateOnStartup</c>), which a deployment using this
    /// migrator deliberately does not do — leaving it with an empty world list
    /// nothing would ever fill, since a client no longer creates worlds itself.
    /// </summary>
    private static async Task<int> SeedAsync(
        IServiceProvider scopedServices,
        TextWriter output,
        CancellationToken cancellationToken)
    {
        var worldService = scopedServices.GetRequiredService<WorldService>();
        var logger = scopedServices
            .GetRequiredService<ILoggerFactory>()
            .CreateLogger(typeof(MigrationCommand).FullName!);

        var existing = await worldService.GetWorldsAsync(cancellationToken).ConfigureAwait(false);
        if (existing.Count > 0)
        {
            await output
                .WriteLineAsync($"{existing.Count} world(s) already exist; seeded nothing.")
                .ConfigureAwait(false);
            return 0;
        }

        await worldService
            .SeedDefaultWorldIfNoneAsync(DefaultWorldName, logger, cancellationToken)
            .ConfigureAwait(false);

        // Not assumed: SeedDefaultWorldIfNoneAsync swallows the race it can lose
        // to another migrator running at the same time, so ask the database.
        var seeded = await worldService.GetWorldsAsync(cancellationToken).ConfigureAwait(false);
        await output
            .WriteLineAsync(
                seeded.Count > 0
                    ? $"Seeded the default world \"{DefaultWorldName}\"."
                    : "No world was seeded.")
            .ConfigureAwait(false);

        return seeded.Count > 0 ? 0 : FailureExitCode;
    }

    private static async Task<int> ReportStatusAsync(
        DatabaseMigrator migrator,
        TextWriter output,
        CancellationToken cancellationToken)
    {
        var status = await migrator.GetStatusAsync(cancellationToken).ConfigureAwait(false);

        await output.WriteLineAsync($"Provider: {status.ProviderName}").ConfigureAwait(false);

        if (!status.Reachable)
        {
            await output
                .WriteLineAsync("Database not reachable (it may simply not exist yet).")
                .ConfigureAwait(false);
        }

        await output.WriteLineAsync($"Applied: {status.Applied.Count}").ConfigureAwait(false);
        await output.WriteLineAsync($"Pending: {status.Pending.Count}").ConfigureAwait(false);
        foreach (var migration in status.Pending)
        {
            await output.WriteLineAsync($"  {migration}").ConfigureAwait(false);
        }

        // A distinct exit code so a deploy script can branch on "needs migrating"
        // without parsing this output. A database that cannot be reached also
        // needs migrating; --migrate then reports why if it really is down.
        return status.IsUpToDate ? 0 : PendingExitCode;
    }

    private static async Task<int> WriteScriptAsync(
        DatabaseMigrator migrator,
        TextWriter output,
        CancellationToken cancellationToken)
    {
        var status = await migrator.GetStatusAsync(cancellationToken).ConfigureAwait(false);
        var script = migrator.GetPendingScript(status);
        await output.WriteAsync(script.AsMemory(), cancellationToken).ConfigureAwait(false);
        await output.WriteLineAsync().ConfigureAwait(false);

        return 0;
    }
}
