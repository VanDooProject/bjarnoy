using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Periodically sweeps expired <c>UserActivitySessionEntity</c> rows (issue
/// #77's follow-up: the tracker keeps writing session history forever
/// otherwise). Same shape as <see cref="WeeklyAggregationHostedService"/> and
/// <see cref="EndbossTriggerHostedService"/>: nothing else ever prunes this
/// table unprompted.
/// </summary>
/// <remarks>
/// The actual pruning lives in <see cref="UserActivityRetentionService.PruneOldSessionsAsync"/>
/// so it can be tested directly, without waiting on this timer; this class is
/// only the loop around it. An hourly sweep is plenty for a
/// <see cref="Infrastructure.Services.UserActivityOptions.RetentionDays"/>
/// window measured in months.
/// </remarks>
public sealed class UserActivityRetentionHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<UserActivityRetentionHostedService> logger) : BackgroundService
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromHours(1);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<UserActivityRetentionHostedService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        // Waits for the first tick before the first sweep, deliberately: a
        // hosted service starts as soon as the host does, which in tests is
        // before the migrator has created the schema (see
        // SqliteApiFixture.InitializeAsync) — a sweep that ran immediately
        // would hit "no such table: user_activity_sessions" every time.
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var retention = scope.ServiceProvider.GetRequiredService<UserActivityRetentionService>();
                var deleted = await retention.PruneOldSessionsAsync(stoppingToken).ConfigureAwait(false);
                if (deleted > 0)
                {
                    _logger.LogInformation("Pruned {DeletedCount} expired user activity session(s).", deleted);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One bad sweep (a transient DB hiccup) must not stop the loop —
                // the next tick tries again.
                _logger.LogError(ex, "User activity retention sweep failed; will retry next tick.");
            }
        }
    }
}
