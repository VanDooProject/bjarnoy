namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// A clock the tests move by hand.
/// </summary>
/// <remarks>
/// Essential here rather than a convenience: the whole backend derives state
/// from elapsed time, so "what does this look like in six hours" is the
/// question most worth asking, and waiting six hours is not an option. The
/// legacy code could not be tested this way at all — it read a static
/// <c>Time.Now</c>.
/// </remarks>
public sealed class TestTimeProvider(DateTimeOffset start) : TimeProvider
{
    private long _ticks = start.UtcTicks;

    public override DateTimeOffset GetUtcNow() =>
        new(Interlocked.Read(ref _ticks), TimeSpan.Zero);

    public void Advance(TimeSpan by)
    {
        if (by < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(by), by, "Tests should not rewind the clock.");
        }

        Interlocked.Add(ref _ticks, by.Ticks);
    }
}
