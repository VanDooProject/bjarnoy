using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
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
    [InlineData("--ensure-world", MigrationCommandKind.ApplyAndEnsureWorld)]
    [InlineData("ensure-world", MigrationCommandKind.ApplyAndEnsureWorld)]
    public void Ensuring_a_world_implies_migrating_since_it_needs_a_schema(
        string arg, MigrationCommandKind expected)
    {
        Assert.Equal(expected, MigrationCommand.Parse([arg]));
    }

    [Fact]
    public void Migrate_and_ensure_world_together_are_one_command()
    {
        Assert.Equal(
            MigrationCommandKind.ApplyAndEnsureWorld,
            MigrationCommand.Parse(["--migrate", "--ensure-world"]));
        Assert.Equal(
            MigrationCommandKind.ApplyAndEnsureWorld,
            MigrationCommand.Parse(["--ensure-world", "--migrate"]));
    }

    [Theory]
    [InlineData("--migrate-status")]
    [InlineData("--migrate-script")]
    public void The_reporting_commands_never_write_a_world(string reportingArg)
    {
        // They exist to say what *would* happen; writing a world while
        // answering that would contradict it.
        Assert.NotEqual(
            MigrationCommandKind.ApplyAndEnsureWorld,
            MigrationCommand.Parse([reportingArg, "--ensure-world"]));
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
    public async Task Ensuring_a_world_leaves_a_fresh_database_with_one_to_join()
    {
        // The deployment case: the app migrates in a separate container and so
        // never runs Program.cs's own seeding, which would otherwise leave the
        // server with an empty world list and nothing able to fill it.
        await using var factory = BjarnoyApiFactory.Sqlite();
        await using var output = new StringWriter();

        var exitCode = await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.ApplyAndEnsureWorld, output, Ct);

        Assert.Equal(0, exitCode);
        var worlds = await factory.GetWorldsAsync(Ct);
        var world = Assert.Single(worlds);
        Assert.Equal(MigrationCommand.DefaultWorldName, world.Name);
    }

    [Fact]
    public async Task Ensuring_a_world_on_a_database_that_has_one_adds_nothing()
    {
        // A redeploy runs the migrator again against a database that is already
        // being played in; a second world (or a replaced one) would be a
        // catastrophe rather than a nuisance.
        await using var factory = BjarnoyApiFactory.Sqlite();
        await using var first = new StringWriter();
        await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.ApplyAndEnsureWorld, first, Ct);
        var seeded = Assert.Single(await factory.GetWorldsAsync(Ct));

        await using var second = new StringWriter();
        var exitCode = await MigrationCommand.RunAsync(
            factory.Services, MigrationCommandKind.ApplyAndEnsureWorld, second, Ct);

        Assert.Equal(0, exitCode);
        var after = Assert.Single(await factory.GetWorldsAsync(Ct));
        Assert.Equal(seeded.Id, after.Id);
        Assert.Contains("created nothing", second.ToString(), StringComparison.Ordinal);
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

    /// <summary>
    /// Existing garrisons stand at the settlement's centre when the garrison-spots migration runs, ships at the Dockyard nearest
    /// the centre (by hex distance, ties by Q, then R) or the centre when there is none; an army's home spot and a guest's spot
    /// follow the same rule. Written as rows under the pre-migration schema, then migrated and read back with plain SQL.
    /// </summary>
    [Fact]
    public async Task The_garrison_spots_migration_puts_existing_garrisons_armies_and_guests_on_spots()
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
                await migrator.MigrateAsync("20261109051630_AddApiKeyAnonymousAccounts", Ct);
            }

            var now = new DateTimeOffset(2026, 1, 1, 10, 0, 0, TimeSpan.Zero).ToString("o");
            var worldId = Guid.CreateVersion7();
            var islandId = Guid.CreateVersion7();
            var userId = Guid.CreateVersion7();
            var harbour = Guid.CreateVersion7(); // centre (3,4), docks at (7,4), (5,6) (both 4 away) and (9,9)
            var inland = Guid.CreateVersion7(); // centre (20,20), no dock
            var landArmy = Guid.CreateVersion7();
            var fleetArmy = Guid.CreateVersion7();
            var guestFleet = Guid.CreateVersion7();

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
                    ("$worldId", worldId.ToString()), ("$now", now));
                await ExecuteAsync(
                    connection,
                    "INSERT INTO islands (Id, WorldId, \"Index\", Name, CentreQ, CentreR, TileCount, StartPositions) VALUES ($i, $w, 0, 'Test isle', 0, 0, 10, '[]')",
                    ("$i", islandId.ToString()), ("$w", worldId.ToString()));
                await ExecuteAsync(
                    connection,
                    "INSERT INTO users (Id, UserName, NormalizedUserName, PasswordHash, Role, Status, CreatedAt, IsSystem) VALUES ($u, 'migration-test-user', 'MIGRATION-TEST-USER', 'x', 0, 0, $now, 0)",
                    ("$u", userId.ToString()), ("$now", now));

                foreach (var (id, q, r) in new[] { (harbour, 3, 4), (inland, 20, 20) })
                {
                    await ExecuteAsync(
                        connection,
                        """
                        INSERT INTO settlements
                            (Id, WorldId, IslandId, UserId, Name, OwnerId, OwnerName, CentreQ, CentreR,
                             StockWood, StockStone, StockFood, StockIron, RateWood, RateStone, RateFood, RateIron,
                             CapacityWood, CapacityStone, CapacityFood, CapacityIron, SettledAt, FoundedAt)
                        VALUES
                            ($id, $w, $i, $u, $name, 'owner', 'Owner', $q, $r, 100, 100, 100, 0, 0, 0, 0, 0, 500, 500, 500, 500, $now, $now)
                        """,
                        ("$id", id.ToString()), ("$w", worldId.ToString()), ("$i", islandId.ToString()), ("$u", userId.ToString()),
                        ("$name", $"s-{id:N}"), ("$q", q), ("$r", r), ("$now", now));
                }

                foreach (var (q, r) in new[] { (7, 4), (5, 6), (9, 9) })
                {
                    await ExecuteAsync(
                        connection,
                        "INSERT INTO placed_buildings (Id, SettlementId, Q, R, Type, Level) VALUES ($id, $s, $q, $r, $type, 1)",
                        ("$id", Guid.CreateVersion7().ToString()), ("$s", harbour.ToString()), ("$q", q), ("$r", r), ("$type", (int)BuildingType.Dockyard));
                }

                foreach (var (settlement, unit, count) in new[]
                {
                    (harbour, UnitType.Spearman, 5), (harbour, UnitType.Karve, 2), (harbour, UnitType.Longship, 1), (inland, UnitType.Karve, 3),
                })
                {
                    await ExecuteAsync(
                        connection,
                        "INSERT INTO unit_stacks (Id, SettlementId, UnitType, Count) VALUES ($id, $s, $t, $c)",
                        ("$id", Guid.CreateVersion7().ToString()), ("$s", settlement.ToString()), ("$t", (int)unit), ("$c", count));
                }

                foreach (var (army, unit, supporting) in new[]
                {
                    (landArmy, UnitType.Spearman, false), (fleetArmy, UnitType.Karve, false), (guestFleet, UnitType.Karve, true),
                })
                {
                    await ExecuteAsync(
                        connection,
                        """
                        INSERT INTO armies
                            (Id, SettlementId, Mission, TargetSettlementId, IsSupporting, Provisions, LootWood, LootStone, LootFood, LootIron,
                             AtHome, DepartedAt, Path, CumulativeHours, EdgeHours, ReturnPath, ReturnCumulativeHours, ReturnEdgeHours,
                             TurnAroundAt, IsReturning, RetreatImmune)
                        VALUES
                            ($id, $home, $mission, $target, $supporting, 10, 0, 0, 0, 0, 0, $now, '[]', '[]', '[]', '[]', '[]', '[]', $now, 0, 0)
                        """,
                        ("$id", army.ToString()), ("$home", harbour.ToString()), ("$mission", supporting ? 2 : 0),
                        ("$target", supporting ? inland.ToString() : DBNull.Value), ("$supporting", supporting ? 1 : 0), ("$now", now));
                    await ExecuteAsync(
                        connection,
                        "INSERT INTO army_unit_stacks (Id, ArmyId, UnitType, Count) VALUES ($id, $a, $t, 1)",
                        ("$id", Guid.CreateVersion7().ToString()), ("$a", army.ToString()), ("$t", (int)unit));
                }
            }

            await using (var context = new GameDbContext(options))
            {
                var migrator = context.GetInfrastructure().GetRequiredService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
                await migrator.MigrateAsync(cancellationToken: Ct);
            }

            await using (var connection = new SqliteConnection(connectionString))
            {
                await connection.OpenAsync(Ct);

                async Task<(long Q, long R)> ReadAsync(string sql, Guid id, params (string, object)[] more)
                {
                    await using var command = connection.CreateCommand();
                    command.CommandText = sql;
                    command.Parameters.AddWithValue("$id", id.ToString());
                    foreach (var (name, value) in more)
                    {
                        command.Parameters.AddWithValue(name, value);
                    }

                    await using var reader = await command.ExecuteReaderAsync(Ct);
                    Assert.True(await reader.ReadAsync(Ct));
                    return (reader.GetInt64(0), reader.GetInt64(1));
                }

                const string Stack = "SELECT SpotQ, SpotR FROM unit_stacks WHERE SettlementId = $id AND UnitType = $t";
                Assert.Equal((3, 4), await ReadAsync(Stack, harbour, ("$t", (int)UnitType.Spearman)));
                // Two docks are four hexes from the centre; the lower Q wins, the farther one never does.
                Assert.Equal((5, 6), await ReadAsync(Stack, harbour, ("$t", (int)UnitType.Karve)));
                Assert.Equal((5, 6), await ReadAsync(Stack, harbour, ("$t", (int)UnitType.Longship)));
                Assert.Equal((20, 20), await ReadAsync(Stack, inland, ("$t", (int)UnitType.Karve)));

                const string Home = "SELECT HomeSpotQ, HomeSpotR FROM armies WHERE Id = $id";
                Assert.Equal((3, 4), await ReadAsync(Home, landArmy));
                Assert.Equal((5, 6), await ReadAsync(Home, fleetArmy));
                // A guest stands at a spot of its host: the host has no dock, so its centre.
                Assert.Equal((20, 20), await ReadAsync("SELECT TargetBuildingQ, TargetBuildingR FROM armies WHERE Id = $id", guestFleet));
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
