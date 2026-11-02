using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Buildings outside the realm decay (docs/design/economy.md, section 5): a settlement is otherwise only settled when somebody
/// reads it, so a building would lose its levels (or a reconnected one start working again) only once the player looked. This
/// sweep applies the realm state to every settlement that has a step due, so it happens even when nobody looks.
/// </summary>
/// <remarks>
/// The sweep itself lives in <see cref="SettlementService.SweepRealmStateAsync"/> so a test can drive it without waiting on this
/// timer; this class is only the loop around it.
/// </remarks>
public sealed class RealmStateHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<RealmStateHostedService> logger) : BackgroundService
{
    /// <summary>How often the realm state is swept.</summary>
    public static readonly TimeSpan PollInterval = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<RealmStateHostedService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        // Waits for the first tick before the first sweep, like CampAggressionHostedService: the host starts this before a
        // test's migrator has created the schema.
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var settlements = scope.ServiceProvider.GetRequiredService<SettlementService>();
                var changed = await settlements.SweepRealmStateAsync(stoppingToken).ConfigureAwait(false);
                if (changed > 0)
                {
                    _logger.LogInformation("Realm sweep updated {Count} settlement(s).", changed);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Realm sweep failed; will retry next tick.");
            }
        }
    }
}
