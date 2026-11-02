using Aspire.Hosting.Testing;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Creates the AppHost testing builder every test starts from.
/// </summary>
public static class TestAppHost
{
    /// <summary>
    /// Radius of the world the shared stack's API seeds once, before
    /// <see cref="AppHostFixture"/> snapshots the database. The default of 4000
    /// takes ~14 s to generate, and several tests generate further worlds of
    /// their own; 1000 takes under a second, and every test seed still draws ~30
    /// islands with plenty of start positions.
    /// </summary>
    public const int WorldRadius = 1000;

    /// <summary>
    /// Builds the AppHost with the HTTP resilience defaults of
    /// <see cref="ApiClientResilience"/>. <paramref name="worldRadius"/> reaches
    /// <c>AppHost.cs</c> as the <c>--World:DefaultRadius</c> command-line argument
    /// (which lands in its <c>builder.Configuration</c> before the resources are
    /// declared); pass <c>null</c> to keep the full-size default world.
    /// </summary>
    public static async Task<IDistributedApplicationTestingBuilder> CreateAsync(
        CancellationToken cancellationToken, int? worldRadius = WorldRadius)
    {
        string[] args = worldRadius is { } radius ? [$"--World:DefaultRadius={radius}"] : [];
        var appHost = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.Bjarnoy_AppHost>(args, cancellationToken);
        appHost.Services.ConfigureHttpClientDefaults(ApiClientResilience.Configure);
        return appHost;
    }
}
