using System.Data.Common;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Test-only <see cref="DbCommandInterceptor"/> that makes a lost write race on <em>one chosen settlement</em>
/// deterministic: right after the application has read that settlement with its buildings (before it saves), a
/// competing write to the same settlement runs to completion, so the application's save is based on a stale
/// <c>Version</c> and fails. Dormant until <see cref="Arm"/> is called.
/// </summary>
/// <remarks>
/// The competing write fires once per attempt: the attempt's own write (even a refused one) re-arms it, so a retry is
/// beaten again when <c>repeat</c> is set. Writes made by the competing action itself never count.
/// </remarks>
public sealed class SettlementRaceInterceptor : DbCommandInterceptor
{
    private Guid _settlementId;
    private Func<Task>? _competing;
    private bool _repeat;
    private bool _busy;
    private bool _firedSinceLastWrite;

    /// <summary>How many times the competing action ran since the last <see cref="Arm"/>.</summary>
    public int Fired { get; private set; }

    /// <summary>
    /// Races reads of <paramref name="settlementId"/>: <paramref name="competing"/> runs after the first such read of
    /// each attempt, once when <paramref name="repeat"/> is false, on every attempt when it is true.
    /// </summary>
    public void Arm(Guid settlementId, Func<Task> competing, bool repeat)
    {
        _settlementId = settlementId;
        _competing = competing;
        _repeat = repeat;
        _firedSinceLastWrite = false;
        Fired = 0;
    }

    public void Disarm() => _competing = null;

    /// <summary>Changes the settlement through its own context, which bumps its concurrency token like any player write.</summary>
    public static async Task BumpAsync(IServiceProvider services, Guid settlementId, CancellationToken cancellationToken)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = await db.Settlements.SingleAsync(s => s.Id == settlementId, cancellationToken);
        settlement.StockWood += 1;
        await db.SaveChangesAsync(cancellationToken);
    }

    public override async ValueTask<DbDataReader> ReaderExecutedAsync(
        DbCommand command,
        CommandExecutedEventData eventData,
        DbDataReader result,
        CancellationToken cancellationToken = default)
    {
        if (!_busy && IsWrite(command))
        {
            _firedSinceLastWrite = false;
        }

        if (_competing is { } competing && !_busy && !_firedSinceLastWrite && IsFullReadOfTarget(command))
        {
            if (!_repeat)
            {
                _competing = null;
            }

            _firedSinceLastWrite = true;
            _busy = true;
            try
            {
                Fired++;
                await competing();
            }
            finally
            {
                _busy = false;
            }
        }

        return result;
    }

    private static bool IsWrite(DbCommand command)
    {
        var text = command.CommandText.AsSpan().TrimStart();
        return text.StartsWith("UPDATE", StringComparison.Ordinal)
            || text.StartsWith("INSERT", StringComparison.Ordinal)
            || text.StartsWith("DELETE", StringComparison.Ordinal);
    }

    private bool IsFullReadOfTarget(DbCommand command) =>
        command.CommandText.Contains("FROM \"settlements\"", StringComparison.Ordinal)
        && command.CommandText.Contains("\"placed_buildings\"", StringComparison.Ordinal)
        && command.Parameters.Cast<DbParameter>().Any(p => Guid.TryParse(p.Value?.ToString(), out var id) && id == _settlementId);
}
