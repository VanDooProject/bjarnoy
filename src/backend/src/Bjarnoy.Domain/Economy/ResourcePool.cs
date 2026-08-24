namespace Bjarnoy.Domain.Economy;

/// <summary>
/// A settlement's resources, held as a stock, a rate and the instant the stock
/// was last true. The current amount is computed on read.
/// </summary>
/// <remarks>
/// <para>
/// This is the legacy <c>EntityResources</c> idea, which is the strongest piece
/// of design in either old code base: nothing ticks. A world of ten thousand
/// settlements does no work at all while nobody is looking at it, and a player
/// who returns after two days sees exactly what accrued, because the answer is
/// derived from a timestamp rather than accumulated by a background job.
/// </para>
/// <para>
/// The type is immutable, and that is what enforces "the stock is only written
/// when it changes". <see cref="At"/> is a pure read that returns a
/// <see cref="ResourceAmounts"/> and leaves the pool untouched — so a request
/// that merely displays a settlement produces no new pool and therefore nothing
/// for the database to save. Only <see cref="Spend"/>, <see cref="Deposit"/> and
/// <see cref="WithRate"/> return a changed pool, and each of those is a real
/// state change that has to be persisted anyway.
/// </para>
/// <para>
/// Two legacy bugs are fixed here. It called <c>Time.Now</c> twice while
/// settling — once to compute the settled stock, once to stamp it — so the
/// production between those two reads was silently lost on every mutation (its
/// own source carries a <c>TODO - fix using other time then the line above</c>).
/// Here a single <c>now</c> is threaded through. And accrual is clamped to
/// capacity but never below zero.
/// </para>
/// </remarks>
public readonly record struct ResourcePool
{
    private ResourcePool(
        ResourceAmounts stock,
        ResourceAmounts ratePerHour,
        ResourceAmounts capacity,
        DateTimeOffset settledAt)
    {
        Stock = stock;
        RatePerHour = ratePerHour;
        Capacity = capacity;
        SettledAt = settledAt;
    }

    /// <summary>The stock as of <see cref="SettledAt"/>. Not the current amount — see <see cref="At"/>.</summary>
    public ResourceAmounts Stock { get; init; }

    /// <summary>Production per hour, as shown next to each stock in the HUD.</summary>
    public ResourceAmounts RatePerHour { get; init; }

    /// <summary>Storage ceiling. Accrual stops here; it does not spill or decay.</summary>
    public ResourceAmounts Capacity { get; init; }

    /// <summary>The instant <see cref="Stock"/> was last true.</summary>
    public DateTimeOffset SettledAt { get; init; }

    public static ResourcePool Create(
        ResourceAmounts stock,
        ResourceAmounts ratePerHour,
        ResourceAmounts capacity,
        DateTimeOffset settledAt)
    {
        if (!capacity.IsNonNegative)
        {
            throw new ArgumentException("Capacity cannot be negative.", nameof(capacity));
        }

        if (!ratePerHour.IsNonNegative)
        {
            throw new ArgumentException(
                "Production rates cannot be negative; upkeep is modelled as a lower rate, not a drain.",
                nameof(ratePerHour));
        }

        return new ResourcePool(
            stock.ClampToZero().ClampTo(capacity), ratePerHour, capacity, settledAt);
    }

    /// <summary>
    /// The stock at <paramref name="now"/>, accrued from
    /// <see cref="SettledAt"/> at <see cref="RatePerHour"/> and clamped to
    /// <see cref="Capacity"/>. A pure read: it does not change the pool.
    /// </summary>
    public ResourceAmounts At(DateTimeOffset now)
    {
        var hours = (now - SettledAt).TotalHours;

        // A clock that goes backwards (NTP correction, a bad caller) must not
        // hand out resources in reverse.
        if (hours <= 0)
        {
            return Stock;
        }

        return (Stock + (RatePerHour * hours)).ClampTo(Capacity);
    }

    /// <summary>
    /// Rolls the stock forward to <paramref name="now"/>. Only needed before a
    /// change; a plain read should use <see cref="At"/> instead so that nothing
    /// has to be written.
    /// </summary>
    public ResourcePool SettledTo(DateTimeOffset now) =>
        now <= SettledAt ? this : this with { Stock = At(now), SettledAt = now };

    /// <summary>Whether <paramref name="cost"/> is affordable at <paramref name="now"/>.</summary>
    public bool CanAfford(ResourceAmounts cost, DateTimeOffset now) => At(now).Covers(cost);

    /// <summary>
    /// Deducts <paramref name="cost"/>, settling to <paramref name="now"/> first.
    /// </summary>
    /// <returns><see langword="false"/> and an unchanged pool when unaffordable.</returns>
    public bool TrySpend(ResourceAmounts cost, DateTimeOffset now, out ResourcePool result)
    {
        if (!cost.IsNonNegative)
        {
            throw new ArgumentException("A cost cannot be negative.", nameof(cost));
        }

        var settled = SettledTo(now);
        if (!settled.Stock.Covers(cost))
        {
            result = this;
            return false;
        }

        result = settled with { Stock = settled.Stock - cost };
        return true;
    }

    /// <summary>Adds resources — a raid's spoils, a caravan's delivery.</summary>
    public ResourcePool Deposit(ResourceAmounts amount, DateTimeOffset now)
    {
        if (!amount.IsNonNegative)
        {
            throw new ArgumentException("A deposit cannot be negative.", nameof(amount));
        }

        var settled = SettledTo(now);
        return settled with { Stock = (settled.Stock + amount).ClampTo(Capacity) };
    }

    /// <summary>
    /// Changes production and/or capacity — what finishing a building does.
    /// </summary>
    /// <remarks>
    /// Settling first is essential: the hours already elapsed must accrue at the
    /// <em>old</em> rate, or a rate increase would retroactively apply to time
    /// the new building did not exist for.
    /// </remarks>
    public ResourcePool WithRate(ResourceAmounts ratePerHour, ResourceAmounts capacity, DateTimeOffset now)
    {
        if (!ratePerHour.IsNonNegative)
        {
            throw new ArgumentException("Production rates cannot be negative.", nameof(ratePerHour));
        }

        if (!capacity.IsNonNegative)
        {
            throw new ArgumentException("Capacity cannot be negative.", nameof(capacity));
        }

        var settled = SettledTo(now);
        return settled with
        {
            RatePerHour = ratePerHour,
            Capacity = capacity,
            Stock = settled.Stock.ClampTo(capacity),
        };
    }

    /// <summary>
    /// When <paramref name="cost"/> becomes affordable at the current rate, or
    /// <see langword="null"/> if it never will.
    /// </summary>
    /// <remarks>
    /// Lets the client show "in 00:38:20" for a build the player cannot yet
    /// afford, without polling. A resource that is short, capped, and not
    /// produced is unreachable.
    /// </remarks>
    public DateTimeOffset? AffordableAt(ResourceAmounts cost, DateTimeOffset now)
    {
        if (CanAfford(cost, now))
        {
            return now;
        }

        if (!cost.ClampTo(Capacity).Covers(cost))
        {
            // The cost exceeds what this settlement can ever store.
            return null;
        }

        var current = At(now);
        var hours = 0.0;

        foreach (var (have, need, rate) in new[]
        {
            (current.Wood, cost.Wood, RatePerHour.Wood),
            (current.Stone, cost.Stone, RatePerHour.Stone),
            (current.Grain, cost.Grain, RatePerHour.Grain),
            (current.Silver, cost.Silver, RatePerHour.Silver),
        })
        {
            var shortfall = need - have;
            if (shortfall <= 0)
            {
                continue;
            }

            if (rate <= 0)
            {
                return null;
            }

            hours = Math.Max(hours, shortfall / rate);
        }

        return now.AddHours(hours);
    }
}
