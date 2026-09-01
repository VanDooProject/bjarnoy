using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Issue #158 stage 1c: reservations earmarked for the waiting build queue
/// must be unspendable on every other voluntary path — one test per spend
/// site, proving a settlement cannot spend its own reservation out from
/// under itself.
/// </summary>
public sealed class ReservedResourcesTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    /// <summary>
    /// A settlement whose entire stock is exactly reserved by a waiting
    /// build order — <see cref="Settlement.AvailableResources"/> is zero
    /// everywhere a spend path might otherwise succeed.
    /// </summary>
    private static Settlement FoundFullyReserved()
    {
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 2)]);
        var farmCost = BuildingCatalogue.Get(BuildingType.Farm, 1).Cost;

        var settlement = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 2)],
            Garrison = [new UnitStack(UnitType.Axeman, 100)],
            Resources = ResourcePool.Create(farmCost * 2, production, ResourceAmounts.Uniform(10_000), T0),
        };

        // Fill both construction slots first, so the reservation-testing
        // order below must go to the waiting queue.
        var neighbours = Centre.Neighbours();
        var active1 = settlement.PlanBuild(BuildingType.Farm, neighbours[0], Terrain.Grass, T0, Guid.CreateVersion7());
        var withActive1 = settlement.Enqueue(active1.Order!, T0);
        var active2 = withActive1.PlanBuild(BuildingType.Farm, neighbours[1], Terrain.Grass, T0, Guid.CreateVersion7());
        var withActive2 = withActive1.Enqueue(active2.Order!, T0);

        // A tiny reservation is enough to prove the point, but we want the
        // reservation to consume everything left, so top the stock up to
        // exactly what both active builds plus the reservation need, and
        // queue the third as waiting.
        var withMore = withActive2 with
        {
            Resources = ResourcePool.Create(
                withActive2.Resources.At(T0) + farmCost, withActive2.Resources.RatePerHour, ResourceAmounts.Uniform(10_000), T0),
        };
        var waiting = withMore.PlanBuild(
            BuildingType.Farm, neighbours[2], Terrain.Grass, T0, Guid.CreateVersion7(), maxWaitingOrders: 3);
        var withWaiting = withMore.Enqueue(waiting.Order!, T0);

        Assert.Single(withWaiting.WaitingOrders);
        Assert.Equal(0.0, withWaiting.AvailableResources(T0).Wood, 6);
        Assert.Equal(0.0, withWaiting.AvailableResources(T0).Food, 6);

        return withWaiting;
    }

    [Fact]
    public void A_new_build_cannot_spend_the_reservation()
    {
        var settlement = FoundFullyReserved();

        var decision = settlement.PlanBuild(
            BuildingType.Farm, Centre.Neighbours()[3], Terrain.Grass, T0, Guid.CreateVersion7());

        Assert.Equal(BuildRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void Training_troops_cannot_spend_the_reservation()
    {
        var settlement = FoundFullyReserved();

        var decision = settlement.PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7());

        Assert.Equal(TrainRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void Dispatch_provisions_cannot_spend_the_reservation()
    {
        var settlement = FoundFullyReserved();

        var decision = settlement.PlanDispatch([new UnitStack(UnitType.Axeman, 10)], provisions: 1, T0);

        Assert.Equal(DispatchRejection.InsufficientResources, decision.Rejection);
    }

    [Fact]
    public void Posting_a_trade_offer_cannot_spend_the_reservation()
    {
        var settlement = FoundFullyReserved();

        var decision = TradeOffer.Plan(
            Guid.CreateVersion7(), settlement, TradeResource.Wood, 1, TradeResource.Stone, 1,
            guildOnly: false, T0);

        Assert.Equal(TradeRejection.NotEnoughResources, decision.Rejection);
    }

    [Fact]
    public void Accepting_a_trade_offer_cannot_spend_the_reservation()
    {
        var acceptor = FoundFullyReserved();

        // A poster far enough away/otherwise valid is not the point here —
        // only PlanAccept's own resource check is under test, so use a
        // second, unrestricted settlement as the poster.
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 2)]);
        var poster = new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Poster",
            Centre = new HexCoord(1, 0),
            Buildings = [new PlacedBuilding(new HexCoord(1, 0), BuildingType.Longhouse, 2)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(1000), production, capacity, T0),
        };

        var offerDecision = TradeOffer.Plan(
            Guid.CreateVersion7(), poster, TradeResource.Wood, 10, TradeResource.Stone, 5, guildOnly: false, T0);
        Assert.True(offerDecision.Accepted, $"expected accept, got {offerDecision.Rejection}");
        var posted = TradeOffer.Post(poster, offerDecision.Offer!, T0);

        var acceptDecision = offerDecision.Offer!.PlanAccept(
            posted, acceptor, isGuildTrade: false, T0, Guid.CreateVersion7(), Guid.CreateVersion7());

        Assert.Equal(TradeRejection.NotEnoughResources, acceptDecision.Rejection);
    }
}
