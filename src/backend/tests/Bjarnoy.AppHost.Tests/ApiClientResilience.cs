using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// The resilience handler every AppHost test puts on its API clients.
/// </summary>
/// <remarks>
/// The standard handler's defaults (10 s per attempt, 30 s in total) are
/// shorter than one world generation at the default radius of 4000, which
/// takes 10-20 s since bogs are generated (b4c5260). The tests that generate
/// a world over HTTP (<c>POST /admin/worlds</c>, <c>preview-seed</c>,
/// <c>reseed</c>) then hit the attempt timeout. Polly then cancels the request,
/// and a retried <c>POST /admin/worlds</c> collides with the world the first
/// attempt already created under the same name, or the total timeout fails
/// the test outright. A single attempt may take up to two minutes here, so a
/// retry only happens on a real transient failure and never just because
/// generation was slow.
/// </remarks>
public static class ApiClientResilience
{
    public static void Configure(IHttpClientBuilder clientBuilder) =>
        clientBuilder.AddStandardResilienceHandler(options =>
        {
            options.AttemptTimeout.Timeout = TimeSpan.FromMinutes(2);
            options.TotalRequestTimeout.Timeout = TimeSpan.FromMinutes(5);
            // The circuit breaker requires a sampling window of at least
            // twice the attempt timeout.
            options.CircuitBreaker.SamplingDuration = TimeSpan.FromMinutes(4);
        });
}
