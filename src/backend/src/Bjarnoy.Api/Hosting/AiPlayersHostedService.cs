using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Runs the AI takeover sweep and the AI turn runner — see
/// <c>docs/design/ai-players.md</c>'s "Execution" section. Same 60-second poll
/// shape as <see cref="WeeklyAggregationHostedService"/>: the actual work
/// lives in <see cref="AiTakeoverService.RunAsync"/>/<see cref="AiPlayerService.RunDueAsync"/>
/// so it can be tested without waiting on this timer.
/// </summary>
public sealed class AiPlayersHostedService(
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    IOptions<AiPlayersOptions> options,
    ILogger<AiPlayersHostedService> logger) : BackgroundService
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly AiPlayersOptions _options = options.Value;
    private readonly ILogger<AiPlayersHostedService> _logger = logger;

    /// <summary>
    /// In-memory only — the last wall-clock instant the takeover sweep ran.
    /// Never persisted: a restarted process simply runs the sweep again on
    /// its very first tick, which is harmless (an already-taken-over
    /// settlement is no longer <c>Abandoned</c>-owned, so it is not a
    /// candidate a second time).
    /// </summary>
    private DateTimeOffset? _lastSweepAt;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        // Waits for the first tick before the first poll, deliberately — same
        // reasoning as WeeklyAggregationHostedService: a hosted service starts
        // before the migrator has created the schema in tests.
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                if (!_options.Enabled)
                {
                    continue;
                }

                await using var scope = _scopeFactory.CreateAsyncScope();

                var now = _timeProvider.GetUtcNow();
                if (_lastSweepAt is null || now - _lastSweepAt >= _options.TakeoverSweepInterval)
                {
                    var takeovers = scope.ServiceProvider.GetRequiredService<AiTakeoverService>();
                    var takenOver = await takeovers.RunAsync(stoppingToken).ConfigureAwait(false);
                    _lastSweepAt = now;

                    if (takenOver > 0)
                    {
                        _logger.LogInformation("AI takeover sweep handed over {Count} settlement(s).", takenOver);
                    }
                }

                var players = scope.ServiceProvider.GetRequiredService<AiPlayerService>();
                await players.RunDueAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                // One bad poll (a transient DB hiccup) must not stop the loop —
                // the next tick tries again.
                _logger.LogError(ex, "AI players poll failed; will retry next tick.");
            }
        }
    }
}
