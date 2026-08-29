using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Polls for leaderboard boards due a refresh (issue #43 §4) — the same reason
/// <see cref="EndbossTriggerHostedService"/> exists: nothing else ever reads
/// every world unprompted, so a world nobody happens to look at would
/// otherwise never get a fresh board.
/// </summary>
/// <remarks>
/// The actual work lives in <see cref="LeaderboardService.RunDueAggregationsAsync"/>
/// so it can be tested without waiting on this timer; this class is only the
/// loop around it. The 60-second poll here is deliberately shorter than the
/// 15-minute target refresh cadence — <see cref="LeaderboardService.RefreshInterval"/>
/// is what keeps a tick from re-writing every board every 60 seconds in
/// production, while letting a test tick the service fast without waiting a
/// real 15 minutes.
/// </remarks>
public sealed class WeeklyAggregationHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<WeeklyAggregationHostedService> logger) : BackgroundService
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<WeeklyAggregationHostedService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        // Waits for the first tick before the first poll, deliberately: a
        // hosted service starts as soon as the host does, which in tests is
        // before the migrator has created the schema (see
        // SqliteApiFixture.InitializeAsync) — a poll that ran immediately
        // would hit "no such table: worlds" every time.
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var leaderboards = scope.ServiceProvider.GetRequiredService<LeaderboardService>();
                await leaderboards.RunDueAggregationsAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One bad poll (a transient DB hiccup) must not stop the loop —
                // the next tick tries again.
                _logger.LogError(ex, "Leaderboard aggregation poll failed; will retry next tick.");
            }
        }
    }
}
