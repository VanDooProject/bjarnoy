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
    TimeProvider timeProvider,
    ILogger<WorldCreationHostedService> logger) : BackgroundService
{
    /// <summary>How long after the host starts the check for creations interrupted by a restart runs.</summary>
    public static readonly TimeSpan InterruptedCheckDelay = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var startedAt = timeProvider.GetUtcNow();
        var interruptedCheck = FailInterruptedAsync(startedAt, stoppingToken);

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

        await interruptedCheck.ConfigureAwait(false);
    }

    /// <summary>
    /// Waits before touching the database, like <see cref="EndbossTriggerHostedService"/>: a hosted service starts as soon as
    /// the host does, in tests before the schema exists (and a SQLite connection would create the file). Worlds created
    /// after <paramref name="startedAt"/> are in the queue, so only older ones count as interrupted.
    /// </summary>
    private async Task FailInterruptedAsync(DateTimeOffset startedAt, CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(InterruptedCheckDelay, cancellationToken).ConfigureAwait(false);
            await using var scope = scopeFactory.CreateAsyncScope();
            await scope.ServiceProvider.GetRequiredService<WorldService>()
                .FailInterruptedWorldCreationsAsync(startedAt, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not check for interrupted world creations after startup.");
        }
    }
}
