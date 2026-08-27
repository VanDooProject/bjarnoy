// Local orchestration: a PostgreSQL container, the API pointed at it, and the
// Vue dev server pointed at the API. `dotnet run` in this project brings the
// whole stack up with one dashboard over it.
//
// Production is deliberately not this: there the frontend is built into the
// API's wwwroot and the two ship as a single image (see deploy/Dockerfile).
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

var postgres = builder.AddPostgres("postgres", password: postgresPassword)
    .WithDataVolume()
    // Keeps a restart from wiping the world you were testing against.
    .WithLifetime(ContainerLifetime.Persistent)
    .WithPgAdmin();

var gamedb = postgres.AddDatabase("gamedb");

// Migrations run as their own resource against the same image the API uses,
// mirroring how a deployment does it, and the API waits for it to exit cleanly.
var migrator = builder.AddProject<Projects.Bjarnoy_Api>("migrator")
    .WithArgs("--migrate")
    .WithReference(gamedb)
    .WaitFor(gamedb)
    .WithEnvironment("Database__Provider", "PostgreSql")
    .WithEnvironment("Database__ConnectionString", gamedb.Resource.ConnectionStringExpression)
    .WithExplicitStart();

var api = builder.AddProject<Projects.Bjarnoy_Api>("api")
    .WithReference(gamedb)
    .WaitFor(gamedb)
    .WithEnvironment("Database__Provider", "PostgreSql")
    .WithEnvironment("Database__ConnectionString", gamedb.Resource.ConnectionStringExpression)
    // In a local run there is no separate migration step to wait on, so the API
    // brings the schema forward itself.
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithHttpHealthCheck("/health");

builder.AddNpmApp("frontend", "../../../frontend", "dev")
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

_ = migrator;

builder.Build().Run();
