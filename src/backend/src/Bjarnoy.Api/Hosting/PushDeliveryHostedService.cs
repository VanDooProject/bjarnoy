using Bjarnoy.Infrastructure.Services.Notifications;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// The second deliberate active poll in an otherwise lazy backend (see
/// <see cref="EndbossTriggerHostedService"/> and docs/tech/backend.md,
/// "Everything is lazy") — a queued push notification is a side effect that
/// must occur even when nobody reads anything, so unlike the rest of the
/// game state it cannot wait for the next request to settle it.
/// </summary>
/// <remarks>
/// The scan itself lives in <see cref="PushDeliveryService.DeliverDueAsync"/>
/// so it can be tested without waiting on this timer; this class is only the
/// loop around it. Only registered when <c>Push</c> is configured — see
/// <c>Program.cs</c>.
/// </remarks>
public sealed class PushDeliveryHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<PushDeliveryHostedService> logger) : BackgroundService
{
    /// <summary>Short: this is the notification-latency ceiling for synchronous events like a chat message.</summary>
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<PushDeliveryHostedService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        // Waits for the first tick before the first poll — same "the migrator
        // may not have created the schema yet" reasoning as EndbossTriggerHostedService.
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var delivery = scope.ServiceProvider.GetRequiredService<PushDeliveryService>();
                await delivery.DeliverDueAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Push delivery poll failed; will retry next tick.");
            }
        }
    }
}
