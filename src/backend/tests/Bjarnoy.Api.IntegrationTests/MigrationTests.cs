using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Infrastructure.Entities;
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
    /// follow the same rule. The rows are written through the model, then the schema is taken back to the migration before
    /// <c>AddGarrisonSpots</c> (which drops the spot columns) and migrated forward again, so the data step runs over them.
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

            var harbour = Guid.CreateVersion7(); // centre (3,4), docks at (7,4), (5,6) (both 4 away) and (9,9)
            var inland = Guid.CreateVersion7(); // centre (20,20), no dock
            var landArmy = Guid.CreateVersion7();
            var fleetArmy = Guid.CreateVersion7();
            var guestFleet = Guid.CreateVersion7();

            await using (var context = new GameDbContext(options))
            {
                await context.Database.MigrateAsync(Ct);

                var world = new WorldEntity { Name = "Migration test world", MaxPlayers = 10 };
                var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
                context.Worlds.Add(world);
                context.Islands.Add(island);

                SettlementEntity Settle(Guid id, int q, int r) => new()
                {
                    Id = id,
                    WorldId = world.Id,
                    IslandId = island.Id,
                    UserId = SystemUserIds.Abandoned,
                    Name = $"s-{id:N}",
                    OwnerId = "owner",
                    OwnerName = "Owner",
                    CentreQ = q,
                    CentreR = r,
                };

                var harbourSettlement = Settle(harbour, 3, 4);
                foreach (var (q, r) in new[] { (7, 4), (5, 6), (9, 9) })
                {
                    harbourSettlement.Buildings.Add(new PlacedBuildingEntity { SettlementId = harbour, Q = q, R = r, Type = BuildingType.Dockyard, Level = 1 });
                }

                harbourSettlement.Garrison.Add(new UnitStackEntity { SettlementId = harbour, UnitType = UnitType.Spearman, Count = 5 });
                harbourSettlement.Garrison.Add(new UnitStackEntity { SettlementId = harbour, UnitType = UnitType.Karve, Count = 2 });
                harbourSettlement.Garrison.Add(new UnitStackEntity { SettlementId = harbour, UnitType = UnitType.Longship, Count = 1 });
                var inlandSettlement = Settle(inland, 20, 20);
                inlandSettlement.Garrison.Add(new UnitStackEntity { SettlementId = inland, UnitType = UnitType.Karve, Count = 3 });
                context.Settlements.AddRange(harbourSettlement, inlandSettlement);

                ArmyEntity Army(Guid id, UnitType unit, bool supporting) => new()
                {
                    Id = id,
                    SettlementId = harbour,
                    Mission = supporting ? (int)ArmyMission.Support : (int)ArmyMission.Move,
                    IsSupporting = supporting,
                    TargetSettlementId = supporting ? inland : null,
                    AtHome = false,
                    Stacks = [new ArmyUnitStackEntity { ArmyId = id, UnitType = unit, Count = 1 }],
                };

                context.Armies.AddRange(
                    Army(landArmy, UnitType.Spearman, supporting: false),
                    Army(fleetArmy, UnitType.Karve, supporting: false),
                    Army(guestFleet, UnitType.Karve, supporting: true));
                await context.SaveChangesAsync(Ct);

                // Back to the schema without the spot columns, then forward again: the data step sees these rows.
                var migrator = context.GetInfrastructure().GetRequiredService<Microsoft.EntityFrameworkCore.Migrations.IMigrator>();
                await migrator.MigrateAsync("20261109051620_AddApiKeyAnonymousAccounts", Ct);
                await migrator.MigrateAsync(cancellationToken: Ct);
            }

            await using (var context = new GameDbContext(options))
            {
                var stacks = await context.UnitStacks.AsNoTracking().ToListAsync(Ct);
                (int Q, int R) SpotOf(Guid settlement, UnitType type) =>
                    stacks.Where(s => s.SettlementId == settlement && s.UnitType == type).Select(s => (s.SpotQ, s.SpotR)).Single();

                Assert.Equal((3, 4), SpotOf(harbour, UnitType.Spearman));
                // Two docks are four hexes from the centre; the lower Q wins, the farther one never does.
                Assert.Equal((5, 6), SpotOf(harbour, UnitType.Karve));
                Assert.Equal((5, 6), SpotOf(harbour, UnitType.Longship));
                Assert.Equal((20, 20), SpotOf(inland, UnitType.Karve));

                var armies = await context.Armies.AsNoTracking().ToListAsync(Ct);
                var land = armies.Single(a => a.Id == landArmy);
                var fleet = armies.Single(a => a.Id == fleetArmy);
                var guest = armies.Single(a => a.Id == guestFleet);
                Assert.Equal((3, 4), (land.HomeSpotQ, land.HomeSpotR));
                Assert.Equal((5, 6), (fleet.HomeSpotQ, fleet.HomeSpotR));
                // A guest stands at a spot of its host: the host has no dock, so its centre.
                Assert.Equal((20, 20), (guest.TargetBuildingQ, guest.TargetBuildingR));
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
