using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Infrastructure.Tests.Services;

public class PerWorldCacheTests
{
    [Fact]
    public async Task A_world_is_loaded_once_however_many_callers_ask()
    {
        var cache = new PerWorldCache<int>();
        var world = Guid.NewGuid();
        var loads = 0;
        var gate = new TaskCompletionSource();

        async Task<int> Load()
        {
            Interlocked.Increment(ref loads);
            await gate.Task;
            return 42;
        }

        var callers = Enumerable.Range(0, 20).Select(_ => cache.GetAsync(world, Load, TestContext.Current.CancellationToken)).ToList();
        gate.SetResult();

        Assert.All(await Task.WhenAll(callers), v => Assert.Equal(42, v));
        Assert.Equal(42, await cache.GetAsync(world, Load, TestContext.Current.CancellationToken));
        Assert.Equal(1, loads);
    }

    [Fact]
    public async Task A_load_that_faulted_is_dropped_and_tried_again()
    {
        var cache = new PerWorldCache<string>();
        var world = Guid.NewGuid();
        var attempts = 0;

        Task<string> Load() => ++attempts == 1 ? Task.FromException<string>(new InvalidOperationException("db down")) : Task.FromResult("ok");

        await Assert.ThrowsAsync<InvalidOperationException>(() => cache.GetAsync(world, Load, TestContext.Current.CancellationToken));
        Assert.False(cache.Contains(world));

        Assert.Equal("ok", await cache.GetAsync(world, Load, TestContext.Current.CancellationToken));
        Assert.Equal(2, attempts);
    }

    [Fact]
    public async Task The_least_recently_used_worlds_are_trimmed_beyond_the_limit()
    {
        var cache = new PerWorldCache<int>(maxCachedWorlds: 2);
        var (a, b, c) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var ct = TestContext.Current.CancellationToken;

        await cache.GetAsync(a, () => Task.FromResult(1), ct);
        await Task.Delay(20, ct);
        await cache.GetAsync(b, () => Task.FromResult(2), ct);
        await Task.Delay(20, ct);
        await cache.GetAsync(a, () => Task.FromResult(1), ct); // a is now more recent than b
        await Task.Delay(20, ct);
        await cache.GetAsync(c, () => Task.FromResult(3), ct);

        Assert.Equal(2, cache.Count);
        Assert.True(cache.Contains(a));
        Assert.False(cache.Contains(b));
        Assert.True(cache.Contains(c));
    }

    [Fact]
    public async Task Invalidating_a_world_makes_the_next_call_load_it_again()
    {
        var cache = new PerWorldCache<int>();
        var world = Guid.NewGuid();
        var value = 1;
        var ct = TestContext.Current.CancellationToken;

        Assert.Equal(1, await cache.GetAsync(world, () => Task.FromResult(value), ct));
        value = 2;
        Assert.Equal(1, await cache.GetAsync(world, () => Task.FromResult(value), ct));

        cache.Invalidate(world);

        Assert.Equal(2, await cache.GetAsync(world, () => Task.FromResult(value), ct));
    }

    [Fact]
    public async Task A_caller_that_gives_up_does_not_cancel_the_load_for_the_others()
    {
        var cache = new PerWorldCache<int>();
        var world = Guid.NewGuid();
        var gate = new TaskCompletionSource<int>();
        using var cancelled = new CancellationTokenSource();

        var impatient = cache.GetAsync(world, () => gate.Task, cancelled.Token);
        var patient = cache.GetAsync(world, () => gate.Task, TestContext.Current.CancellationToken);
        await cancelled.CancelAsync();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => impatient);

        gate.SetResult(7);
        Assert.Equal(7, await patient);
    }

    [Fact]
    public async Task WorldIslandCaches_invalidate_clears_every_registered_cache()
    {
        var first = WorldIslandCaches.Register(new PerWorldCache<int>());
        var second = WorldIslandCaches.Register(new PerWorldCache<string>());
        var world = Guid.NewGuid();
        await first.GetAsync(world, () => Task.FromResult(1), TestContext.Current.CancellationToken);
        await second.GetAsync(world, () => Task.FromResult("x"), TestContext.Current.CancellationToken);

        WorldIslandCaches.Invalidate(world);

        Assert.False(first.Contains(world));
        Assert.False(second.Contains(world));
    }
}
