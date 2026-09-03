using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The migrator's contract, since a deploy branches on it.
/// </summary>
public sealed class MigrationTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task An_unmigrated_database_reports_every_migration_as_pending()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();

        var status = await factory.GetMigrationStatusAsync(Ct);

        Assert.False(status.Reachable);
        Assert.Empty(status.Applied);
        Assert.NotEmpty(status.Pending);
        Assert.False(status.IsUpToDate);
    }

    [Fact]
    public async Task Migrating_applies_everything_and_leaves_nothing_pending()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();

        await factory.MigrateAsync(Ct);
        var status = await factory.GetMigrationStatusAsync(Ct);

        Assert.True(status.Reachable);
        Assert.NotEmpty(status.Applied);
        Assert.Empty(status.Pending);
        Assert.True(status.IsUpToDate);
    }

    [Fact]
    public async Task Migrating_twice_is_a_no_op_the_second_time()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();

        await factory.MigrateAsync(Ct);
        var before = await factory.GetMigrationStatusAsync(Ct);

        // A deploy may retry its migration step; that must not fail or reapply.
        await factory.MigrateAsync(Ct);
        var after = await factory.GetMigrationStatusAsync(Ct);

        Assert.Equal(before.Applied, after.Applied);
    }

    [Theory]
    [InlineData("--migrate", MigrationCommandKind.Apply)]
    [InlineData("migrate", MigrationCommandKind.Apply)]
    [InlineData("--migrate-status", MigrationCommandKind.Status)]
    [InlineData("migrate-status", MigrationCommandKind.Status)]
    [InlineData("--migrate-script", MigrationCommandKind.Script)]
    [InlineData("migrate-script", MigrationCommandKind.Script)]
    public void Migration_flags_are_recognised(string arg, MigrationCommandKind expected)
    {
        Assert.Equal(expected, MigrationCommand.Parse([arg]));
    }

    [Theory]
    [InlineData()]
    [InlineData("--urls", "http://localhost:5000")]
    [InlineData("--environment", "Production")]
    public void Ordinary_host_arguments_do_not_trigger_migrator_mode(params string[] args)
    {
        Assert.Equal(MigrationCommandKind.None, MigrationCommand.Parse(args));
    }

    [Fact]
    public void A_migration_flag_is_found_among_other_arguments()
    {
        Assert.Equal(
            MigrationCommandKind.Apply,
            MigrationCommand.Parse(["--environment", "Production", "--migrate"]));
    }

    [Fact]
    public async Task Running_the_apply_command_reports_what_it_did_and_exits_zero()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await using var output = new StringWriter();

        var exitCode = await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.Apply, output, Ct);

        Assert.Equal(0, exitCode);
        Assert.Contains("Applied", output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_status_command_exits_two_while_migrations_are_pending()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await using var output = new StringWriter();

        var exitCode = await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.Status, output, Ct);

        // A deploy script branches on this code rather than parsing the text.
        Assert.Equal(MigrationCommand.PendingExitCode, exitCode);
    }

    [Fact]
    public async Task The_status_command_exits_zero_once_the_schema_is_current()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await factory.MigrateAsync(Ct);
        await using var output = new StringWriter();

        var exitCode = await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.Status, output, Ct);

        Assert.Equal(0, exitCode);
        Assert.Contains("Pending: 0", output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_script_command_emits_the_sql_it_would_run()
    {
        await using var factory = BjarnoyApiFactory.Sqlite();
        await using var output = new StringWriter();

        var exitCode = await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.Script, output, Ct);

        var script = output.ToString();
        Assert.Equal(0, exitCode);
        Assert.Contains("CREATE TABLE", script, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("worlds", script, StringComparison.Ordinal);

        // Emitting a script must not apply it.
        var status = await factory.GetMigrationStatusAsync(Ct);
        Assert.Empty(status.Applied);
    }

    /// <summary>
    /// Issue #158's AddConstructionSlots migration promises a lossless
    /// backfill for a build order that already existed (already started,
    /// with a real <c>StartedAt</c>/<c>CompletesAt</c>) before the migration
    /// ran: nothing is dropped, <c>QueuedAt</c> is backdated to
    /// <c>StartedAt</c>, and <c>BaseDuration</c> is derived from the two
    /// timestamps the row already had. Builds the row by hand against the
    /// exact pre-migration schema (raw ADO.NET — the current C# entity model
    /// already expects the post-migration columns, so it cannot write a
    /// pre-migration row itself) rather than through the app, then migrates
    /// forward and reads it back through the ordinary domain model.
    /// </summary>
    [Fact]
    public async Task An_existing_in_flight_build_order_survives_the_construction_slots_migration()
    {
        var file = Path.Combine(Path.GetTempPath(), $"bjarnoy-migration-test-{Guid.CreateVersion7():N}.db");
        var connectionString = $"Data Source={file}";
        try
        {
            var options = new DbContextOptionsBuilder<GameDbContext>()
                .UseSqlite(connectionString, sqlite => sqlite.MigrationsAssembly(MigrationAssemblies.Sqlite))
                .Options;

            await using (var context = new GameDbContext(options))
            {
                var migrator = context.GetInfrastructure().GetRequiredService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();

                // Bring the schema to exactly one migration before
                // AddConstructionSlots — the last one where build_orders'
                // StartedAt/CompletesAt are still NOT NULL and QueuedAt/
                // BaseDuration do not exist yet.
                await migrator.MigrateAsync("20260829180835_AddUserActivity", Ct);
            }

            var worldId = Guid.CreateVersion7();
            var islandId = Guid.CreateVersion7();
            var userId = Guid.CreateVersion7();
            var settlementId = Guid.CreateVersion7();
            var orderId = Guid.CreateVersion7();
            var startedAt = new DateTimeOffset(2026, 1, 1, 10, 0, 0, TimeSpan.Zero);
            var completesAt = new DateTimeOffset(2026, 1, 1, 12, 30, 0, TimeSpan.Zero);

            await using (var connection = new SqliteConnection(connectionString))
            {
                await connection.OpenAsync(Ct);

                await ExecuteAsync(
                    connection,
                    """
                    INSERT INTO worlds
                        (Id, Name, Seed, Radius, IslandCellSize, IslandChance, IslandMinRadius, IslandMaxRadius,
                         BeachThreshold, MountainThreshold, MountainRockiness, ForestRockiness, MinimumIslandTiles,
                         MaxPlayers, Status, CreatedAt)
                    VALUES
                        ($worldId, 'Migration test world', 1, 40, 8, 0.5, 3, 8, 0.2, 0.7, 0.5, 0.5, 5, 20, 0, $now)
                    """,
                    ("$worldId", worldId.ToString()), ("$now", startedAt.ToString("o")));

                await ExecuteAsync(
                    connection,
                    """
                    INSERT INTO islands (Id, WorldId, "Index", Name, CentreQ, CentreR, TileCount, StartPositions)
                    VALUES ($islandId, $worldId, 0, 'Test isle', 0, 0, 10, '[]')
                    """,
                    ("$islandId", islandId.ToString()), ("$worldId", worldId.ToString()));

                await ExecuteAsync(
                    connection,
                    """
                    INSERT INTO users (Id, UserName, NormalizedUserName, PasswordHash, Role, Status, CreatedAt, IsSystem)
                    VALUES ($userId, 'migration-test-user', 'MIGRATION-TEST-USER', 'x', 0, 0, $now, 0)
                    """,
                    ("$userId", userId.ToString()), ("$now", startedAt.ToString("o")));

                await ExecuteAsync(
                    connection,
                    """
                    INSERT INTO settlements
                        (Id, WorldId, IslandId, UserId, Name, OwnerId, OwnerName, CentreQ, CentreR,
                         StockWood, StockStone, StockFood, StockIron, RateWood, RateStone, RateFood, RateIron,
                         CapacityWood, CapacityStone, CapacityFood, CapacityIron, SettledAt, FoundedAt)
                    VALUES
                        ($settlementId, $worldId, $islandId, $userId, 'Migration test settlement', 'owner', 'Owner',
                         0, 0, 100, 100, 100, 0, 0, 0, 0, 0, 500, 500, 500, 500, $now, $now)
                    """,
                    ("$settlementId", settlementId.ToString()), ("$worldId", worldId.ToString()),
                    ("$islandId", islandId.ToString()), ("$userId", userId.ToString()), ("$now", startedAt.ToString("o")));

                // The row under test: an in-flight Farm order, already
                // started under the pre-migration schema.
                await ExecuteAsync(
                    connection,
                    """
                    INSERT INTO build_orders (Id, SettlementId, Q, R, Type, TargetLevel, StartedAt, CompletesAt)
                    VALUES ($orderId, $settlementId, 1, 0, $type, 1, $startedAt, $completesAt)
                    """,
                    ("$orderId", orderId.ToString()), ("$settlementId", settlementId.ToString()),
                    ("$type", ((int)BuildingType.Farm).ToString()),
                    ("$startedAt", startedAt.ToString("o")), ("$completesAt", completesAt.ToString("o")));
            }

            await using (var context = new GameDbContext(options))
            {
                var migrator = context.GetInfrastructure().GetRequiredService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
                await migrator.MigrateAsync(cancellationToken: Ct);
            }

            await using (var context = new GameDbContext(options))
            {
                // Filtered client-side (ToListAsync then Single) rather than
                // via a server-side .Where(o => o.Id == orderId): the row was
                // inserted with a hand-written Guid.ToString(), which is not
                // guaranteed to match the exact TEXT format the Sqlite
                // provider's own parameter translation produces for a raw
                // Guid comparison — irrelevant for real inserts (always
                // through EF), but this table has exactly one row anyway.
                var order = (await context.BuildOrders.AsNoTracking().ToListAsync(Ct)).Single(o => o.Id == orderId);

                // Lossless: the row survived, and StartedAt/CompletesAt are
                // exactly what they were before the migration.
                Assert.Equal(startedAt, order.StartedAt);
                Assert.Equal(completesAt, order.CompletesAt);

                // Backfilled: QueuedAt = StartedAt (the real order time
                // predates the column and is not recoverable), BaseDuration
                // derived from the two timestamps the row already had.
                Assert.Equal(startedAt, order.QueuedAt);
                Assert.Equal(completesAt - startedAt, order.BaseDuration);

                var settlement = (await context.Settlements
                    .Include(s => s.Buildings)
                    .Include(s => s.Queue)
                    .Include(s => s.Garrison)
                    .Include(s => s.TrainingQueue)
                    .Include(s => s.Runes)
                    .AsNoTracking()
                    .ToListAsync(Ct)).Single(s => s.Id == settlementId);
                var domain = settlement.ToDomain();
                var domainOrder = Assert.Single(domain.Queue);
                Assert.False(domainOrder.IsWaiting);
                Assert.Equal(startedAt, domainOrder.StartedAt);
                Assert.Equal(completesAt, domainOrder.CompletesAt);
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(file);
        }
    }

    private static async Task ExecuteAsync(
        SqliteConnection connection, string sql, params (string Name, object Value)[] parameters)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value);
        }

        await command.ExecuteNonQueryAsync(Ct);
    }
}
