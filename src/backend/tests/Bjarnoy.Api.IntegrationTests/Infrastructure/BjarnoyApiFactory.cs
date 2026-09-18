using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Hosts the real application over a real database.
/// </summary>
/// <remarks>
/// <para>
/// Nothing is substituted: the endpoints, the EF model, the migrations and the
/// SQL the provider emits are all exercised. That is the point — the legacy
/// suite replaced every repository with an in-memory fake, so it never ran a
/// query, while still paying for a migration run.
/// </para>
/// <para>
/// Each factory owns its own database, so test classes are independent and can
/// run in parallel. The legacy suite shared one database and migrated it in
/// <c>[OneTimeSetUp]</c>, which made it order-dependent.
/// </para>
/// </remarks>
public sealed class BjarnoyApiFactory : WebApplicationFactory<Program>
{
    private readonly string _connectionString;
    private readonly DatabaseProvider _provider;
    private readonly string? _databaseFile;

    /// <summary>Set by <see cref="WithBuild"/>; null means an unstamped build.</summary>
    private BuildInfoOptions? _build;

    /// <summary>Set by <see cref="WithDiagnostics"/>; null leaves it to the build.</summary>
    private DiagnosticsOptions? _diagnostics;

    /// <summary>Set by <see cref="WithPush"/>; null leaves push unconfigured (the default, unstamped-build-style state).</summary>
    private PushOptions? _push;

    private BjarnoyApiFactory(DatabaseProvider provider, string connectionString, string? databaseFile)
    {
        _provider = provider;
        _connectionString = connectionString;
        _databaseFile = databaseFile;
    }

    /// <summary>
    /// A factory backed by a SQLite file of its own, in the test run's temp
    /// directory.
    /// </summary>
    /// <remarks>
    /// A file rather than <c>:memory:</c>: an in-memory SQLite database lives
    /// only as long as its connection, so pooled connections would each see a
    /// different, empty database.
    /// </remarks>
    public static BjarnoyApiFactory Sqlite()
    {
        var file = Path.Combine(
            Path.GetTempPath(),
            $"bjarnoy-tests-{Guid.CreateVersion7():N}.db");

        return new BjarnoyApiFactory(DatabaseProvider.Sqlite, $"Data Source={file}", file);
    }

    /// <summary>A factory against an already-running PostgreSQL instance.</summary>
    public static BjarnoyApiFactory PostgreSql(string connectionString) =>
        new(DatabaseProvider.PostgreSql, connectionString, databaseFile: null);

    public DatabaseProvider Provider => _provider;

    /// <summary>
    /// The clock the application sees. Tests advance it to ask what the world
    /// looks like later, rather than waiting.
    /// </summary>
    public TestTimeProvider Time { get; } =
        new(new DateTimeOffset(2026, 1, 1, 12, 0, 0, TimeSpan.Zero));

    /// <summary>Directory used as the application's web root during tests.</summary>
    public static string TestWebRootPath { get; } =
        Path.Combine(AppContext.BaseDirectory, "TestWebRoot");

    /// <summary>The marker in the stub <c>index.html</c>, asserted by the fallback tests.</summary>
    public const string SpaStubMarker = "bjarnoy-spa-stub";

    /// <summary>Fixed test signing key — long enough for HS256's minimum key size.</summary>
    public const string TestSigningKey = "integration-test-signing-key-do-not-use-in-production-0123456789";

    /// <summary>Applies migrations, exactly as a deployment's migrator step would.</summary>
    public async Task MigrateAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<DatabaseMigrator>()
            .MigrateAsync(cancellationToken);
    }

    /// <summary>
    /// Stamps this host with the build information <c>deploy/Dockerfile</c>'s
    /// build args would supply, for the <c>/api/v1/info</c> tests.
    /// </summary>
    public BjarnoyApiFactory WithBuild(
        string version, string commit, string branch, string builtAt,
        string runtimeCommit = BuildInfoOptions.Unknown)
    {
        _build = new BuildInfoOptions
        {
            Version = version,
            Commit = commit,
            Branch = branch,
            BuiltAt = builtAt,
            RuntimeCommit = runtimeCommit,
        };

        return this;
    }

    /// <summary>
    /// Overrides what the build's branch would otherwise decide about the
    /// diagnostic surfaces — the per-deployment escape hatch, as an env var
    /// would supply it.
    /// </summary>
    public BjarnoyApiFactory WithDiagnostics(
        bool? publicBuildInfo = null, bool? exposeApiReference = null)
    {
        _diagnostics = new DiagnosticsOptions
        {
            PublicBuildInfo = publicBuildInfo,
            ExposeApiReference = exposeApiReference,
        };

        return this;
    }

    /// <summary>
    /// Push (Web Push/VAPID) is unconfigured by default in tests, same as an
    /// unstamped build — call this for the tests that need
    /// <c>NotificationEndpoints</c>'s subscribe/deliver paths enabled.
    /// </summary>
    public BjarnoyApiFactory WithPush(
        string vapidPublicKey = "test-vapid-public-key",
        string vapidPrivateKey = "test-vapid-private-key",
        string subject = "mailto:test@bjarnoy.local")
    {
        _push = new PushOptions
        {
            VapidPublicKey = vapidPublicKey,
            VapidPrivateKey = vapidPrivateKey,
            Subject = subject,
        };

        return this;
    }

    /// <summary>The worlds the database holds, in creation order.</summary>
    public async Task<IReadOnlyList<WorldEntity>> GetWorldsAsync(
        CancellationToken cancellationToken = default)
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<WorldService>()
            .GetWorldsAsync(cancellationToken);
    }

    public async Task<MigrationStatus> GetMigrationStatusAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<DatabaseMigrator>()
            .GetStatusAsync(cancellationToken);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.UseEnvironment(Environments.Production);

        builder.UseSetting($"{DatabaseOptions.SectionName}:Provider", _provider.ToString());
        builder.UseSetting($"{DatabaseOptions.SectionName}:ConnectionString", _connectionString);
        builder.UseSetting($"{DatabaseOptions.SectionName}:MigrateOnStartup", "false");

        // A fixed key so tokens minted by one test are still valid tokens (not
        // that any test relies on that) and so the app has something to sign
        // with — Program.cs requires Jwt:SigningKey to be set, same as it
        // requires a database connection string.
        builder.UseSetting($"{JwtOptions.SectionName}:SigningKey", TestSigningKey);

        // Health endpoints are opt-in outside development; the tests assert on them.
        builder.UseSetting("ExposeHealthChecks", "true");

        // Unset unless a test asked for it, via WithPush — same "unconfigured
        // means the feature is off" default Program.cs itself uses.
        if (_push is not null)
        {
            builder.UseSetting($"{PushOptions.SectionName}:VapidPublicKey", _push.VapidPublicKey);
            builder.UseSetting($"{PushOptions.SectionName}:VapidPrivateKey", _push.VapidPrivateKey);
            builder.UseSetting($"{PushOptions.SectionName}:Subject", _push.Subject);
        }

        // Unset unless a test asked for it, so /api/v1/info's "unstamped build"
        // case is the default here exactly as it is for a plain `dotnet run`.
        if (_build is not null)
        {
            builder.UseSetting($"{BuildInfoOptions.SectionName}:Version", _build.Version);
            builder.UseSetting($"{BuildInfoOptions.SectionName}:Commit", _build.Commit);
            builder.UseSetting($"{BuildInfoOptions.SectionName}:Branch", _build.Branch);
            builder.UseSetting($"{BuildInfoOptions.SectionName}:BuiltAt", _build.BuiltAt);
            builder.UseSetting($"{BuildInfoOptions.SectionName}:RuntimeCommit", _build.RuntimeCommit);
        }

        if (_diagnostics?.PublicBuildInfo is { } publicBuildInfo)
        {
            builder.UseSetting(
                $"{DiagnosticsOptions.SectionName}:PublicBuildInfo",
                publicBuildInfo.ToString());
        }

        if (_diagnostics?.ExposeApiReference is { } exposeApiReference)
        {
            builder.UseSetting(
                $"{DiagnosticsOptions.SectionName}:ExposeApiReference",
                exposeApiReference.ToString());
        }

        // Stand in for the built frontend the Docker image bakes into wwwroot,
        // so the SPA-fallback tests do not depend on whether anyone has run a
        // frontend build.
        builder.UseWebRoot(TestWebRootPath);

        // SetMinimumLevel only sets a fallback used when no rule matches, and
        // appsettings.json's "Logging:LogLevel:Default": "Information" is
        // itself a category-less rule, so it wins over that fallback and the
        // app's own info logs (world generation, migrations, settlement
        // service) still reach the console. AddFilter registers an explicit
        // rule instead, which — being added after the configuration-based
        // one — actually takes effect and keeps CI logs down to what a
        // failing test needs to be findable in them.
        builder.ConfigureLogging(logging => logging.AddFilter(null, LogLevel.Warning));

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(Time);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);

        if (!disposing || _databaseFile is null)
        {
            return;
        }

        foreach (var path in new[] { _databaseFile, $"{_databaseFile}-wal", $"{_databaseFile}-shm" })
        {
            try
            {
                File.Delete(path);
            }
            catch (IOException)
            {
                // A leftover temp file is not worth failing a test run over.
            }
        }
    }
}
