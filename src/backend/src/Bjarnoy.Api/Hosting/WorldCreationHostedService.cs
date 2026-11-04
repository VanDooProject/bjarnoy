using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Generates the worlds queued by <c>POST /api/v1/admin/worlds</c>, one at a time (a generation already uses every core).
/// A radius-4000 world takes about a minute, which is longer than a proxy such as Cloudflare waits for a response,
/// so the request only stores the world as "creating" and this does the work.
/// </summary>
public sealed class WorldCreationHostedService(
    WorldCreationQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<WorldCreationHostedService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await FailInterruptedAsync(stoppingToken).ConfigureAwait(false);

        await foreach (var request in queue.Reader.ReadAllAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<WorldService>()
                    .CompleteWorldCreationAsync(request.WorldId, request.AutoSeed, stoppingToken)
                    .ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // CompleteWorldCreationAsync records its own failures; this only keeps one bad item from ending the loop.
                logger.LogError(ex, "World creation {WorldId} ended with an error.", request.WorldId);
            }
        }
    }

    private async Task FailInterruptedAsync(CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<WorldService>()
                .FailInterruptedWorldCreationsAsync(cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The schema may not exist yet when the host starts (tests migrate after startup); nothing can be interrupted then.
            logger.LogWarning(ex, "Could not check for interrupted world creations at startup.");
        }
    }
}
