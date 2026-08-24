namespace Bjarnoy.Infrastructure.Persistence;

public enum DatabaseProvider
{
    /// <summary>
    /// Single-file database. What a one-container deployment and local dev use.
    /// </summary>
    Sqlite = 0,

    /// <summary>Hosted multi-world play.</summary>
    PostgreSql = 1,
}

/// <summary>Which database the game runs on, and how to reach it.</summary>
public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    public DatabaseProvider Provider { get; set; } = DatabaseProvider.Sqlite;

    /// <summary>
    /// Overrides the <c>gamedb</c> connection string when set. Aspire supplies
    /// that connection string in a hosted run; this exists for the standalone
    /// SQLite case and for tests.
    /// </summary>
    public string? ConnectionString { get; set; }

    /// <summary>
    /// Applies pending migrations during startup. Off by default: a deployment
    /// should run <c>Bjarnoy.Api --migrate</c> as a separate step before the new
    /// containers take over, so a failed migration fails the deploy rather than
    /// half the replicas. Handy for local SQLite runs.
    /// </summary>
    public bool MigrateOnStartup { get; set; }
}
