using Asp.Versioning;
using Bjarnoy.Api.Endpoints;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.ServiceDefaults;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;

// Migrator mode: this executable applies (or reports on) migrations and exits,
// so a deployment can bring the schema forward with the exact image it is about
// to roll out, before the new containers take over. See MigrationCommand.
var migrationCommand = MigrationCommand.Parse(args);

var builder = WebApplication.CreateBuilder(args);

if (migrationCommand != MigrationCommandKind.None)
{
    // The output of a CLI run is its report; EF's per-statement logging would
    // bury it. The migrator's own progress logs stay at Information.
    builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", LogLevel.Warning);
}

builder.AddServiceDefaults();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddGameDatabase(builder.Configuration);
builder.Services.AddScoped<WorldService>();
builder.Services.AddScoped<SettlementService>();

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

// Validates the DataAnnotations on request records before a handler runs, so a
// malformed request is a 400 with per-field detail rather than an exception from
// a guard clause deeper in.
builder.Services.AddValidation();

// Versions are literal path segments (/api/v1/...) rather than a
// {version:apiVersion} route parameter. Both are supported by Asp.Versioning,
// but only the literal form produces concrete paths in the OpenAPI document —
// which is what the frontend generates its typed client from. A future v2 adds
// a second group beside the first.
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
});

var app = builder.Build();

if (migrationCommand != MigrationCommandKind.None)
{
    return await MigrationCommand.RunAsync(app.Services, migrationCommand, Console.Out);
}

var databaseOptions = app.Services.GetRequiredService<IOptions<DatabaseOptions>>().Value;
if (databaseOptions.MigrateOnStartup)
{
    await using var scope = app.Services.CreateAsyncScope();
    await scope.ServiceProvider.GetRequiredService<DatabaseMigrator>().MigrateAsync();
}

app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

var versionSet = app.NewApiVersionSet()
    .HasApiVersion(new ApiVersion(1, 0))
    .ReportApiVersions()
    .Build();

app.MapDefaultEndpoints();
app.MapWorldEndpoints(versionSet);
app.MapSettlementEndpoints(versionSet);

// The built Vue frontend is copied into wwwroot by the Docker build, so one
// container serves both the API and the app it talks to. In a local run wwwroot
// is empty and Aspire runs Vite separately, so this is a no-op.
app.UseDefaultFiles();
app.MapStaticAssets();

// An unmatched /api route must not be answered with the SPA shell: a caller
// expecting JSON would get HTML and a parse error instead of a 404. This is a
// fallback too, but a more specific one, so it outranks the SPA fallback below.
app.MapFallback("/api/{**segment}", () => Results.NotFound());

// Anything else that is neither a real file nor an endpoint is a client-side
// route, and belongs to the SPA router (the frontend uses HTML5 history mode).
app.MapFallbackToFile("index.html");

await app.RunAsync();
return 0;

/// <summary>Exposed so the integration tests can host this application.</summary>
public partial class Program;
