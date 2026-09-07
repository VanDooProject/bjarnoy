namespace Bjarnoy.Infrastructure.Tests;

/// <summary>A clock the tests move by hand — same idiom as the API integration tests' own copy.</summary>
public sealed class TestTimeProvider(DateTimeOffset start) : TimeProvider
{
    private long _ticks = start.UtcTicks;

    public override DateTimeOffset GetUtcNow() => new(Interlocked.Read(ref _ticks), TimeSpan.Zero);

    public void Advance(TimeSpan by) => Interlocked.Add(ref _ticks, by.Ticks);
}
