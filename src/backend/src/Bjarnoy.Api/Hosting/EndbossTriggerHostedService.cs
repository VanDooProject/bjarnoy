using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// The one active poll in an otherwise lazy backend (see docs/tech/backend.md,
/// "Everything is lazy"): scans for worlds whose <c>EndbossAt</c> has come and
/// fires it, because nothing else ever reads every world unprompted, and a
/// world nobody happens to look at would otherwise never trigger.
/// </summary>
/// <remarks>
/// The scan itself lives in <see cref="WorldService.TriggerDueEndbossesAsync"/>
/// so it can be tested (and driven from an integration test) without waiting on
/// this timer; this class is only the loop around it.
/// </remarks>
public sealed class EndbossTriggerHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<EndbossTriggerHostedService> logger) : BackgroundService
{
    /// <summary>How often the poll runs. Cheap enough to run this often: a no-op scan is one indexed query.</summary>
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(30);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<EndbossTriggerHostedService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        do
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var worlds = scope.ServiceProvider.GetRequiredService<WorldService>();
                await worlds.TriggerDueEndbossesAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One bad poll (a transient DB hiccup) must not stop the loop —
                // the next tick tries again.
                _logger.LogError(ex, "Endboss trigger poll failed; will retry next tick.");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
