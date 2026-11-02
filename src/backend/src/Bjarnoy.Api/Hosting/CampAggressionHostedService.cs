using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Strong wildlife camps attack towers inside their guard range (docs/design/wildlife-camps.md, "Strong camps
/// attack"). Like the endboss trigger this is an active poll in an otherwise lazy backend: nobody reads a tower
/// unprompted, so a camp's attack would never happen if nothing scanned for it.
/// </summary>
/// <remarks>
/// The scan itself lives in <see cref="CampAggressionService.ProcessDueWorldsAsync"/> so it can be driven from a
/// test without waiting on this timer; this class is only the loop around it.
/// </remarks>
public sealed class CampAggressionHostedService(
    IServiceScopeFactory scopeFactory,
    ILogger<CampAggressionHostedService> logger) : BackgroundService
{
    /// <summary>How often camps look for towers to attack.</summary>
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);

    private readonly IServiceScopeFactory _scopeFactory = scopeFactory;
    private readonly ILogger<CampAggressionHostedService> _logger = logger;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        // Waits for the first tick before the first scan, like EndbossTriggerHostedService: the host starts this
        // before a test's migrator has created the schema.
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await using var scope = _scopeFactory.CreateAsyncScope();
                var aggression = scope.ServiceProvider.GetRequiredService<CampAggressionService>();
                await aggression.ProcessDueWorldsAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Camp aggression scan failed; will retry next tick.");
            }
        }
    }
}
