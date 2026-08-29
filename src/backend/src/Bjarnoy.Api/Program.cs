using System.Text;
using Asp.Versioning;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Endpoints;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.Json;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.ServiceDefaults;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
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
builder.Services.AddScoped<ArmyService>();
builder.Services.AddScoped<BattleReportService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<ProfileService>();
builder.Services.AddScoped<LeaderboardService>();

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

// Lets a PATCH body (e.g. UpdateWorldSettingsRequest) distinguish "field
// omitted" from "field sent as null" for properties that are themselves
// nullable in the domain. See Bjarnoy.Api.Json.Optional.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new OptionalJsonConverterFactory()));

// Short-lived signed access tokens plus a server-side revocable refresh token
// (RefreshTokenEntity) — see docs/tech/backend.md, "Not in here yet: Auth".
// Jwt:SigningKey/Issuer/Audience follow the same config convention as
// Database:ConnectionString (DatabaseOptions): appsettings.Development.json
// has a dev default, a real deployment sets Jwt__SigningKey itself.
//
// None of this is needed in migrator mode: the migrator only touches the
// database schema, never serves a request, so it must not fail to start just
// because no JWT signing key was configured (e.g. the Docker image's CI
// smoke test, which runs `--migrate` with no Jwt__SigningKey at all).
if (migrationCommand == MigrationCommandKind.None)
{
    builder.Services.AddOptions<JwtOptions>()
        .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
        .ValidateOnStart();
    builder.Services.AddSingleton<JwtTokenService>();

    var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
    var jwtSigningKey = jwtSection["SigningKey"]
        ?? throw new InvalidOperationException(
            $"{JwtOptions.SectionName}:SigningKey is required to sign access tokens.");

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtSection["Issuer"] ?? "bjarnoy",
                ValidateAudience = true,
                ValidAudience = jwtSection["Audience"] ?? "bjarnoy",
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSigningKey)),
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
            };
        });

    // Token expiry is otherwise checked against the real wall clock, not the
    // app's injected TimeProvider (the same one JwtTokenService mints tokens
    // from) — harmless in production, where they're the same clock, but it means
    // a test that moves TimeProvider away from "now" mints tokens that instantly
    // read as expired or not-yet-valid. A custom LifetimeValidator keeps
    // validation on the one clock the rest of the app uses.
    builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
        .Configure<TimeProvider>((options, time) =>
        {
            options.TokenValidationParameters.LifetimeValidator = (notBefore, expires, _, parameters) =>
            {
                var now = time.GetUtcNow().UtcDateTime;
                return (notBefore is null || notBefore <= now + parameters.ClockSkew)
                    && (expires is null || expires >= now - parameters.ClockSkew);
            };
        });

    // One role, one policy: Admin-only endpoints (issue #27) use this. Locked/
    // banned enforcement on existing mutating endpoints is separate — see
    // ActiveUserEndpointFilter — because anonymous play must keep working, which
    // rules out a policy that itself demands authentication.
    builder.Services.AddAuthorizationBuilder()
        .AddPolicy("Admin", policy => policy.RequireRole(nameof(UserRole.Admin)));

    // The one active poll in an otherwise lazy backend (issue #27's endboss
    // trigger) — the migrator never serves requests, so it has no business
    // running this. See EndbossTriggerHostedService.
    builder.Services.AddHostedService<EndbossTriggerHostedService>();

    // The leaderboard/weekly-stats aggregation job (issue #43) — same "the
    // migrator never serves requests" reasoning as the endboss trigger above.
    builder.Services.AddHostedService<WeeklyAggregationHostedService>();
}

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

// Seeds the first Admin from ADMIN_BOOTSTRAP_USERNAME/ADMIN_BOOTSTRAP_PASSWORD
// if neither an Admin nor that username already exists. A no-op (with a
// logged warning) when either variable is unset, so the app still starts
// fine with no bootstrap admin configured — e.g. in tests.
await using (var adminSeedScope = app.Services.CreateAsyncScope())
{
    var authService = adminSeedScope.ServiceProvider.GetRequiredService<AuthService>();
    var logger = adminSeedScope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await authService.SeedAdminIfConfiguredAsync(
        Environment.GetEnvironmentVariable("ADMIN_BOOTSTRAP_USERNAME"),
        Environment.GetEnvironmentVariable("ADMIN_BOOTSTRAP_PASSWORD"),
        logger);
}

app.UseExceptionHandler();
app.UseStatusCodePages();

app.UseAuthentication();
app.UseAuthorization();

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
app.MapAuthEndpoints(versionSet);
app.MapWorldEndpoints(versionSet);
app.MapSettlementEndpoints(versionSet);
app.MapProfileEndpoints(versionSet);
app.MapLeaderboardEndpoints(versionSet);
app.MapArmyEndpoints(versionSet);
app.MapSimulatorEndpoints(versionSet);
app.MapAdminWorldEndpoints(versionSet);
app.MapAdminUserEndpoints(versionSet);
app.MapAdminSettlementEndpoints(versionSet);
app.MapAdminProfileReportEndpoints(versionSet);

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
