using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

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
}
