// Local orchestration: a PostgreSQL container, the API pointed at it, and the
// Vue dev server pointed at the API. `dotnet run` in this project brings the
// whole stack up with one dashboard over it.
//
// Production is deliberately not this: there the frontend is built into the
// API's wwwroot and the two ship as a single image (see deploy/Dockerfile).
var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
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
    .WithExplicitStart();

var api = builder.AddProject<Projects.Bjarnoy_Api>("api")
    .WithReference(gamedb)
    .WaitFor(gamedb)
    .WithEnvironment("Database__Provider", "PostgreSql")
    // In a local run there is no separate migration step to wait on, so the API
    // brings the schema forward itself.
    .WithEnvironment("Database__MigrateOnStartup", "true")
    .WithHttpHealthCheck("/health");

builder.AddNpmApp("frontend", "../../../frontend", "dev")
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(env: "PORT")
    .WithEnvironment("BROWSER", "none")
    .WithExternalHttpEndpoints()
    .PublishAsDockerFile();

_ = migrator;

builder.Build().Run();
