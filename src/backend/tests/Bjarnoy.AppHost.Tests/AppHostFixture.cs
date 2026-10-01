using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// One Aspire stack (Postgres container, API, Vite dev server) shared by every
/// test in the assembly, so the boot cost is paid once instead of per test.
/// </summary>
/// <remarks>
/// Each test still needs a pristine database (they assert on a single seeded
/// world, reseed or add worlds, change speed settings), so the fixture
/// snapshots <c>gamedb</c> once with <c>CREATE DATABASE ... TEMPLATE</c> and
/// <see cref="ResetAsync"/> restores it before every test — a ~0.1 s copy
/// instead of a fresh world generation. The API is stopped around the restore
/// (nothing may be connected to the database being dropped) and started again
/// afterwards because it keeps in-memory caches (terrain, realm directory, plot
/// reservations) that would otherwise outlive the data they describe.
/// <para>
/// The snapshot is taken from a database rebuilt empty during setup rather than
/// from whatever the stack came up with: outside CI the AppHost keeps Postgres'
/// data volume, so <c>gamedb</c> can hold stale data from earlier runs.
/// </para>
/// </remarks>
public sealed class AppHostFixture : IAsyncLifetime
{
    private const string Api = "api";
    private const string Frontend = "frontend";
    private const string Database = "gamedb";
    private const string SnapshotDatabase = "gamedb_snapshot";

    private DistributedApplication? _app;

    public DistributedApplication App =>
        _app ?? throw new InvalidOperationException("The AppHost fixture has not been initialized.");

    public ResourceNotificationService ResourceNotifications =>
        App.Services.GetRequiredService<ResourceNotificationService>();

    public async ValueTask InitializeAsync()
    {
        // Own budget: the tests' six-minute tokens only start once they run.
        using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(10));
        var cancellationToken = cts.Token;

        var appHost = await TestAppHost.CreateAsync(cancellationToken);

        // On shutdown the API flushes telemetry to the dashboard's OTLP endpoint,
        // which the test host leaves unresponsive — at the default 10 s export
        // timeout that outlasts DCP's stop grace period and fails the stop.
        var api = appHost.Resources.Single(r => r.Name == Api);
        api.Annotations.Add(new EnvironmentCallbackAnnotation("OTEL_EXPORTER_OTLP_TIMEOUT", () => "1000"));

        _app = await appHost.BuildAsync(cancellationToken);
        await _app.StartAsync(cancellationToken);

        await ResourceNotifications.WaitForResourceHealthyAsync(Api, cancellationToken);
        await ResourceNotifications.WaitForResourceHealthyAsync(Frontend, cancellationToken);

        // Rebuild gamedb empty, let the API migrate + seed it, then snapshot.
        await StopApiAsync(cancellationToken);
        await ExecuteAdminSqlAsync(
            [$"DROP DATABASE IF EXISTS \"{Database}\" WITH (FORCE)", $"CREATE DATABASE \"{Database}\""],
            cancellationToken);
        await StartApiAsync(cancellationToken);

        await StopApiAsync(cancellationToken);
        await CreateSnapshotAsync(cancellationToken);
        await StartApiAsync(cancellationToken);
    }

    /// <summary>
    /// Restores <c>gamedb</c> to the freshly seeded snapshot and restarts the API
    /// so its in-memory state matches. Call at the start of every test.
    /// </summary>
    public async Task ResetAsync(CancellationToken cancellationToken)
    {
        await StopApiAsync(cancellationToken);
        await ExecuteAdminSqlAsync(
            [
                $"DROP DATABASE IF EXISTS \"{Database}\" WITH (FORCE)",
                $"CREATE DATABASE \"{Database}\" TEMPLATE \"{SnapshotDatabase}\"",
            ],
            cancellationToken);
        await StartApiAsync(cancellationToken);
        await ResourceNotifications.WaitForResourceHealthyAsync(Frontend, cancellationToken);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            await _app.DisposeAsync();
        }
    }

    private async Task StopApiAsync(CancellationToken cancellationToken)
    {
        await ExecuteCommandAsync(KnownResourceCommands.StopCommand, cancellationToken);
        await ResourceNotifications.WaitForResourceAsync(
            Api,
            e => e.Snapshot.State?.Text is { } state && KnownResourceStates.TerminalStates.Contains(state),
            cancellationToken);
    }

    private async Task StartApiAsync(CancellationToken cancellationToken)
    {
        await ExecuteCommandAsync(KnownResourceCommands.StartCommand, cancellationToken);
        await ResourceNotifications.WaitForResourceHealthyAsync(Api, cancellationToken);
    }

    private async Task ExecuteCommandAsync(string command, CancellationToken cancellationToken)
    {
        var result = await App.Services.GetRequiredService<ResourceCommandService>()
            .ExecuteCommandAsync(Api, command, cancellationToken);
        if (!result.Success)
        {
            throw new InvalidOperationException($"'{command}' on resource '{Api}' failed: {result.Message}");
        }
    }

    /// <summary>
    /// <c>CREATE DATABASE ... TEMPLATE</c> fails while anything is connected to
    /// the source, and Aspire's own <c>gamedb</c> health check keeps reconnecting
    /// even with the API stopped — so kick other sessions off and retry.
    /// </summary>
    private async Task CreateSnapshotAsync(CancellationToken cancellationToken)
    {
        await ExecuteAdminSqlAsync([$"DROP DATABASE IF EXISTS \"{SnapshotDatabase}\" WITH (FORCE)"], cancellationToken);
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await ExecuteAdminSqlAsync(
                    [
                        $"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{Database}' AND pid <> pg_backend_pid()",
                        $"CREATE DATABASE \"{SnapshotDatabase}\" TEMPLATE \"{Database}\"",
                    ],
                    cancellationToken);
                return;
            }
            catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.ObjectInUse && attempt < 10)
            {
                await Task.Delay(TimeSpan.FromMilliseconds(500), cancellationToken);
            }
        }
    }

    private async Task ExecuteAdminSqlAsync(string[] statements, CancellationToken cancellationToken)
    {
        var connectionString = await App.GetConnectionStringAsync("postgres", cancellationToken)
            ?? throw new InvalidOperationException("The postgres resource has no connection string.");
        var builder = new NpgsqlConnectionStringBuilder(connectionString) { Database = "postgres", Pooling = false };

        await using var connection = new NpgsqlConnection(builder.ConnectionString);
        await connection.OpenAsync(cancellationToken);
        foreach (var statement in statements)
        {
            await using var command = new NpgsqlCommand(statement, connection);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        NpgsqlConnection.ClearAllPools();
    }
}
