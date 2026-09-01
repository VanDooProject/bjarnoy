using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Beginner-area spawn segregation (design doc §6, issue #132): the ring walk,
/// the two-phase <c>openPlots</c> computation, and the exhaustion fallback —
/// built directly against hand-placed <see cref="WorldEntity"/>/
/// <see cref="IslandEntity"/>/<see cref="SettlementEntity"/> rows (bypassing
/// <c>WorldGenerator</c> entirely) so ring assignment and island layout are
/// exact rather than whatever a real seed happens to produce.
/// </summary>
public sealed class BeginnerSuggestionTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private const int Radius = 60;

    // ringWidth = Radius / RingCount = 60 / 6 = 10, so ring 0 is distance
    // 0-9 from the origin, ring 1 is 10-19, and so on — matching the design
    // doc's own worked example.
    private const int RingWidth = Radius / BeginnerSuggestionService.RingCount;

    private async Task<(GameDbContext Db, WorldService Worlds, BeginnerSuggestionService Suggestions, WorldEntity World)>
        NewWorldAsync(IServiceScope scope)
    {
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var worlds = scope.ServiceProvider.GetRequiredService<WorldService>();
        var suggestions = scope.ServiceProvider.GetRequiredService<BeginnerSuggestionService>();

        var world = new WorldEntity
        {
            Name = $"w-{Guid.CreateVersion7():N}",
            Radius = Radius,
            MaxPlayers = 500,
            CreatedAt = _factory.Time.GetUtcNow(),
        };
        db.Worlds.Add(world);
        await db.SaveChangesAsync(Ct);

        return (db, worlds, suggestions, world);
    }

    private static IslandEntity NewIsland(Guid worldId, int index, HexCoord centre, params HexCoord[] startPositions) => new()
    {
        WorldId = worldId,
        Index = index,
        Name = $"Island {index}",
        CentreQ = centre.Q,
        CentreR = centre.R,
        TileCount = 50,
        StartPositions = [.. startPositions.Select(p => new HexPoint(p.Q, p.R))],
    };

    /// <summary>A settlement whose claim disc (level-1 longhouse, radius 1) sits exactly on <paramref name="at"/>.</summary>
    private SettlementEntity NewSettlement(Guid worldId, Guid islandId, HexCoord at, DateTimeOffset? shieldExpiresAtUtc)
    {
        var now = _factory.Time.GetUtcNow();
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = $"S-{Guid.CreateVersion7():N}"[..10],
            OwnerName = "Ulf",
            OwnerId = $"owner-{Guid.CreateVersion7():N}",
            UserId = SystemUserIds.Abandoned,
            CentreQ = at.Q,
            CentreR = at.R,
            FoundedAt = now,
            ShieldExpiresAtUtc = shieldExpiresAtUtc,
        };

        settlement.ApplyDomain(new Settlement
        {
            Id = settlement.Id,
            Name = settlement.Name,
            Centre = at,
            Buildings = [new PlacedBuilding(at, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(0), production, capacity, now),
            ShieldExpiresAtUtc = shieldExpiresAtUtc,
        });

        return settlement;
    }

    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(9, 0, 0)]
    [InlineData(10, 0, 1)]
    [InlineData(19, 0, 1)]
    [InlineData(20, 0, 2)]
    [InlineData(59, 0, 5)]
    public void RingOf_is_hex_distance_from_origin_divided_by_ring_width(int q, int r, int expectedRing)
    {
        var ring = HexCoord.Distance(HexCoord.Origin, new HexCoord(q, r)) / RingWidth;
        Assert.Equal(expectedRing, ring);
    }

    [Fact]
    public async Task An_island_fully_claimed_by_shielded_beginners_still_qualifies_but_has_no_open_plots()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var (db, _, suggestions, world) = await NewWorldAsync(scope);

        // Ring 0: both of this island's start positions are already sat on
        // by still-shielded settlements — qualifying (nobody graduated), but
        // with literally nowhere left to click.
        var posA = new HexCoord(0, 0);
        var posB = new HexCoord(5, 0);
        var island = NewIsland(world.Id, 0, centre: posA, posA, posB);
        db.Islands.Add(island);

        var now = _factory.Time.GetUtcNow();
        db.Settlements.Add(NewSettlement(world.Id, island.Id, posA, now + TimeSpan.FromDays(5)));
        db.Settlements.Add(NewSettlement(world.Id, island.Id, posB, now + TimeSpan.FromDays(5)));
        await db.SaveChangesAsync(Ct);

        var result = await suggestions.GetSuggestedStartAsync(world.Id, HexCoord.Origin, cancellationToken: Ct);

        Assert.NotNull(result);
        // Genuinely nowhere left anywhere in this tiny world — falls all the
        // way through to the (empty) fallback, not a false "still qualifies"
        // offer of an already-taken plot.
        Assert.True(result!.Fallback);
        Assert.Empty(result.Candidates);
    }

    [Fact]
    public async Task A_ring_where_every_island_is_fully_claimed_falls_through_to_the_next_ring_out()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var (db, _, suggestions, world) = await NewWorldAsync(scope);
        var now = _factory.Time.GetUtcNow();

        // Two ring-0 islands, both fully claimed by still-shielded settlers —
        // qualifying, zero openPlots, must be skipped (see the test above).
        var ringZeroA = NewIsland(world.Id, 0, new HexCoord(2, 0), new HexCoord(2, 0));
        var ringZeroB = NewIsland(world.Id, 1, new HexCoord(-2, 0), new HexCoord(-2, 0));
        db.Islands.AddRange(ringZeroA, ringZeroB);
        db.Settlements.Add(NewSettlement(world.Id, ringZeroA.Id, new HexCoord(2, 0), now + TimeSpan.FromDays(5)));
        db.Settlements.Add(NewSettlement(world.Id, ringZeroB.Id, new HexCoord(-2, 0), now + TimeSpan.FromDays(5)));

        // A ring-1 island with a genuinely open, unclaimed plot.
        var ringOneCentre = new HexCoord(15, 0);
        var ringOneOpenPlot = new HexCoord(15, 5);
        var ringOne = NewIsland(world.Id, 2, ringOneCentre, ringOneOpenPlot);
        db.Islands.Add(ringOne);

        await db.SaveChangesAsync(Ct);

        var result = await suggestions.GetSuggestedStartAsync(world.Id, HexCoord.Origin, cancellationToken: Ct);

        Assert.NotNull(result);
        Assert.False(result!.Fallback);
        var candidate = Assert.Single(result.Candidates);
        Assert.Equal(ringOne.Id, candidate.IslandId);
        Assert.Equal(1, candidate.Ring);
        Assert.Equal(ringOneOpenPlot.Q, candidate.Q);
        Assert.Equal(ringOneOpenPlot.R, candidate.R);
    }

    [Fact]
    public async Task Total_exhaustion_falls_back_to_the_unfiltered_nearest_open_plot_search()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var (db, _, suggestions, world) = await NewWorldAsync(scope);
        var now = _factory.Time.GetUtcNow();

        // Island X: fully claimed by beginners — qualifying, zero openPlots.
        var claimedPos = new HexCoord(2, 0);
        var claimedIsland = NewIsland(world.Id, 0, claimedPos, claimedPos);
        db.Islands.Add(claimedIsland);
        db.Settlements.Add(NewSettlement(world.Id, claimedIsland.Id, claimedPos, now + TimeSpan.FromDays(5)));

        // Island Y: has a graduated (unshielded) settlement — disqualified —
        // but still has an actually-open plot elsewhere on it. This is the
        // only open plot anywhere in the world, and it must never be offered
        // through the ring walk (the island doesn't qualify) — only through
        // the unfiltered fallback once every other option is exhausted.
        var graduateAt = new HexCoord(30, 0);
        var openPlotOnGraduatedIsland = new HexCoord(30, 20);
        var graduatedIsland = NewIsland(world.Id, 1, graduateAt, graduateAt, openPlotOnGraduatedIsland);
        db.Islands.Add(graduatedIsland);
        db.Settlements.Add(NewSettlement(world.Id, graduatedIsland.Id, graduateAt, shieldExpiresAtUtc: null));

        await db.SaveChangesAsync(Ct);

        var result = await suggestions.GetSuggestedStartAsync(world.Id, HexCoord.Origin, cancellationToken: Ct);

        Assert.NotNull(result);
        Assert.True(result!.Fallback);
        var candidate = Assert.Single(result.Candidates);
        Assert.Equal(graduatedIsland.Id, candidate.IslandId);
        Assert.Equal(openPlotOnGraduatedIsland.Q, candidate.Q);
        Assert.Equal(openPlotOnGraduatedIsland.R, candidate.R);
    }

    /// <summary>
    /// The point of the two-phase check (design doc §6, mirroring #155's
    /// reasoning for <c>FoundAsync</c> itself): a settlement's own centre can
    /// be far enough from a candidate plot to clear phase 1's cheap
    /// <c>MinimumSpacing</c> pre-filter (13, centre-to-centre only), while a
    /// <em>Tower</em>'s own satellite disc — which phase 1 is deliberately
    /// blind to — still reaches the plot. Phase 2's live
    /// <see cref="Settlement.ClaimDiscsFor"/> check is what actually catches
    /// this; a phase-1-only implementation would wrongly offer this plot.
    /// </summary>
    [Fact]
    public async Task A_towers_satellite_disc_closes_a_plot_that_clears_the_cheap_phase_1_filter()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var (db, _, suggestions, world) = await NewWorldAsync(scope);
        var now = _factory.Time.GetUtcNow();

        var centre = new HexCoord(0, 0);
        var towerCoord = new HexCoord(13, 0);
        // TowerClaimRadius(8) == 4; plus FoundingSafetyMargin(2) plus
        // BeginnerComfortMargin(2) reaches 8 hexes out from the tower itself.
        var towerLevel = 8;
        var candidatePlot = new HexCoord(19, 0); // distance 6 from the tower — inside its 8-hex reach.

        // Sanity check on this test's own premises, so a future constant
        // change fails loudly here instead of the assertions below silently
        // testing something else: the candidate clears phase 1 (>= 13 from
        // the settlement's own centre) but sits within the tower's real reach.
        Assert.True(candidatePlot.DistanceTo(centre) >= SettlementService.MinimumSpacing);
        Assert.True(candidatePlot.DistanceTo(towerCoord)
            <= Settlement.TowerClaimRadius(towerLevel) + SettlementService.FoundingSafetyMargin + BeginnerSuggestionService.BeginnerComfortMargin);

        var island = NewIsland(world.Id, 0, centre, candidatePlot);
        db.Islands.Add(island);

        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var settlement = new SettlementEntity
        {
            WorldId = world.Id,
            IslandId = island.Id,
            Name = "Towered",
            OwnerName = "Ulf",
            OwnerId = $"owner-{Guid.CreateVersion7():N}",
            UserId = SystemUserIds.Abandoned,
            CentreQ = centre.Q,
            CentreR = centre.R,
            FoundedAt = now,
            ShieldExpiresAtUtc = now + TimeSpan.FromDays(5),
        };
        settlement.ApplyDomain(new Settlement
        {
            Id = settlement.Id,
            Name = settlement.Name,
            Centre = centre,
            Buildings =
            [
                new PlacedBuilding(centre, BuildingType.Longhouse, 1),
                new PlacedBuilding(towerCoord, BuildingType.Tower, towerLevel),
            ],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(0), production, capacity, now),
            ShieldExpiresAtUtc = now + TimeSpan.FromDays(5),
        });
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);

        var result = await suggestions.GetSuggestedStartAsync(world.Id, HexCoord.Origin, cancellationToken: Ct);

        Assert.NotNull(result);
        Assert.True(result!.Fallback);
        Assert.Empty(result.Candidates);
    }

    [Fact]
    public async Task Founding_invalidates_the_islands_cached_open_plots()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var (db, worlds, suggestions, world) = await NewWorldAsync(scope);

        var posA = new HexCoord(0, 0);
        var posB = new HexCoord(20, 0);
        var island = NewIsland(world.Id, 0, posA, posA, posB);
        db.Islands.Add(island);
        await db.SaveChangesAsync(Ct);

        var before = await suggestions.GetSuggestedStartAsync(world.Id, HexCoord.Origin, cancellationToken: Ct);
        Assert.NotNull(before);
        Assert.False(before!.Fallback);
        Assert.Equal(2, before.Candidates.Count);

        var settlements = scope.ServiceProvider.GetRequiredService<SettlementService>();
        var founded = await settlements.FoundAsync(
            world.Id, island.Id, posA, "Bjornstad", "Ulf", "ulf-player", Ct);
        Assert.True(founded.Accepted);

        var after = await suggestions.GetSuggestedStartAsync(world.Id, HexCoord.Origin, cancellationToken: Ct);
        Assert.NotNull(after);
        // posA is now taken, and posB sits well within posA's own claim disc
        // plus both margins (distance 20 is still inside — no, distance 20
        // is outside radius 1+2+2=5) — so only posA is actually closed here;
        // the cache must reflect that, not still answer with the pre-founding count.
        Assert.Single(after!.Candidates);
        Assert.Equal(posB.Q, after.Candidates[0].Q);
        Assert.Equal(posB.R, after.Candidates[0].R);
    }
}
