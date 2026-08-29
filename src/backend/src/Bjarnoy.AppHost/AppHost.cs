// Local orchestration: a PostgreSQL container, the API pointed at it, and the
// Vue dev server pointed at the API. `dotnet run` in this project brings the
// whole stack up with one dashboard over it.
//
// Production is deliberately not this: there the frontend is built into the
// API's wwwroot and the two ship as a single image (see deploy/Dockerfile).
using System.Security.Cryptography;

var builder = DistributedApplication.CreateBuilder(args);

// A fixed password rather than Aspire's default random one. Postgres only sets
// its password at first initdb, but a random parameter is regenerated on every
// apphost run — so a later run hands the container a password that no longer
// matches the data volume from the previous run, and every connection fails
// with "password authentication failed for user postgres". Pinning it keeps
// the volume and the container in agreement across restarts. Local dev only;
// nothing outside this container network can reach it, and a real deployment
// connects with real credentials via Database:ConnectionString.
var postgresPassword = builder.AddParameter("postgres-password", "bjarnoy-dev-only", secret: true);

var isCI = Environment.GetEnvironmentVariable("CI") == "true" ||
           Environment.GetEnvironmentVariable("GITHUB_ACTIONS") == "true";

// A fresh random admin password every run — unlike postgres-password above,
// there's no persisted state to desync from, since AuthService.SeedAdminIfConfiguredAsync
// (called from Program.cs on every startup) is a no-op once any Admin already
// exists, so re-seeding with a new password each run only matters for a
// clean database. This means a dev never has to invent, remember, or type
// admin credentials for local Aspire runs: the "Log in as admin" dashboard
// link added on the frontend resource below carries them.
const string adminUserName = "admin";
var adminPasswordValue = Convert.ToHexString(RandomNumberGenerator.GetBytes(9));
var adminPassword = builder.AddParameter("admin-bootstrap-password", adminPasswordValue, secret: true);

var postgres = builder.AddPostgres("postgres", password: postgresPassword)
    .WithDataVolume()
    // Keeps a restart from wiping the world you were testing against.
    .WithLifetime(ContainerLifetime.Persistent);

if (!isCI)
{
    postgres.WithPgAdmin();
}

var gamedb = postgres.AddDatabase("gamedb");

// Migrations run as their own resource against the same image the API uses,
// mirroring how a deployment does it, and the API waits for it to exit cleanly.
// launchProfileName: null / explicit WithHttpEndpoint() / ASPNETCORE_ENVIRONMENT —
// see the api resource below for why; same reasoning applies here.
var migrator = builder.AddProject<Projects.Bjarnoy_Api>("migrator", launchProfileName: null)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithHttpEndpoint()
    .WithArgs("--migrate")
    .WithReference(gamedb)
    .WaitFor(gamedb)
    .WithEnvironment("Database__Provider", "PostgreSql")
    .WithEnvironment("Database__ConnectionString", gamedb.Resource.ConnectionStringExpression)
    .WithExplicitStart();

// launchProfileName: null — suppresses the "http"/"https" endpoints AddProject
// would otherwise infer from launchSettings.json's fixed ports (5180/7180).
// Those are shared across every checkout of this repo, so two AppHost
// instances running at once (two branches, two worktrees) fight over the
// same port; when the second one loses that race, Kestrel binds wherever's
// actually free instead (visible in its own startup log), but the
// dashboard/health check were already wired to the launchSettings port and
// never learn about the fallback — they just time out forever even though
// the API is up. WithHttpEndpoint() below (no `port:`) is one Aspire
// allocates and tracks itself instead, so every concurrent instance gets its
// own free port with nothing to lose a race over. ASPNETCORE_ENVIRONMENT is
// set explicitly since suppressing the launch profile also suppresses the
// "Development" it would otherwise have supplied.
var api = builder.AddProject<Projects.Bjarnoy_Api>("api", launchProfileName: null)
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithHttpEndpoint()
    .WithReference(gamedb)
    .WaitFor(gamedb)
    .WithEnvironment("Database__Provider", "PostgreSql")
    .WithEnvironment("Database__ConnectionString", gamedb.Resource.ConnectionStringExpression)
    // In a local run there is no separate migration step to wait on, so the API
    // brings the schema forward itself.
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithEnvironment("ADMIN_BOOTSTRAP_USERNAME", adminUserName)
    .WithEnvironment("ADMIN_BOOTSTRAP_PASSWORD", adminPassword)
    .WithHttpHealthCheck("/health");

var frontend = builder.AddNpmApp("frontend", "../../../frontend", "dev")
    .WithReference(api)
    .WaitFor(api)
    // This picks the port and hands it to the child process as PORT — the
    // endpoint every other resource's WithReference and the dashboard
    // actually point at. Vite has no built-in convention for PORT and binds
    // its own default (5173) regardless, so on its own this env var does
    // nothing: ../../../frontend/vite.config.ts reads process.env.PORT
    // itself (its `aspirePort` const) and passes it to Vite's `server.port`
    // with `strictPort: true`, which is what actually makes Vite bind here.
    // Without that, the dashboard link 404s/connection-resets while `npm run
    // dev` looks like it started fine on its own default port.
    .WithHttpEndpoint(env: "PORT")
    .WithEnvironment("BROWSER", "none")
    // Without this the frontend defaults to VITE_DEMO_MODE's own default
    // (true, see config.ts) and never talks to the API this apphost just
    // wired up for it — every "aspire run" would silently fall back to the
    // in-memory demo simulation instead of the real backend. The dev server
    // still reaches the API same-origin (API_BASE_URL stays '/api/v1'):
    // vite.config.ts proxies it to whatever endpoint WithReference(api)
    // exposed as services__api__*__0.
    .WithEnvironment("VITE_DEMO_MODE", "false")
    .WithExternalHttpEndpoints()
    .PublishAsDockerFile();

// One-click admin login from the dashboard, so nobody has to go dig the
// generated password out of an env var or user secret. Runs after Aspire has
// allocated the frontend's endpoints, hence the callback rather than a plain
// WithUrl: the frontend's dev-server port isn't known until then (see the
// WithHttpEndpoint(env: "PORT") comment above).
frontend.WithUrls(context =>
{
    var baseUrl = context.Urls.FirstOrDefault(u => u.Endpoint is not null)?.Url;
    if (string.IsNullOrEmpty(baseUrl))
    {
        return;
    }

    context.Urls.Add(new ResourceUrlAnnotation
    {
        Url = $"{baseUrl}/login?username={Uri.EscapeDataString(adminUserName)}" +
              $"&password={Uri.EscapeDataString(adminPasswordValue)}" +
              // Without this, LoginView.vue's post-login redirect falls back
              // to its default of '/' (see its onSubmit) rather than landing
              // in the admin area this link exists to reach.
              $"&redirect={Uri.EscapeDataString("/admin")}",
        DisplayText = "Log in as admin",
    });
});

_ = migrator;

builder.Build().Run();
