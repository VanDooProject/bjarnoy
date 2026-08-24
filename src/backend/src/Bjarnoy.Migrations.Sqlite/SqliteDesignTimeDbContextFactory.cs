using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Bjarnoy.Migrations.Sqlite;

/// <summary>
/// Builds a SQLite-flavoured <see cref="GameDbContext"/> for <c>dotnet ef</c>.
/// </summary>
/// <remarks>
/// Design time only. The connection string is never opened — EF just needs the
/// provider to know which SQL dialect to scaffold — so it does not have to point
/// at a real database.
/// </remarks>
public sealed class SqliteDesignTimeDbContextFactory : IDesignTimeDbContextFactory<GameDbContext>
{
    public GameDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<GameDbContext>()
            .UseSqlite(
                "Data Source=design-time.db",
                sqlite => sqlite.MigrationsAssembly(MigrationAssemblies.Sqlite))
            .Options;

        return new GameDbContext(options);
    }
}
