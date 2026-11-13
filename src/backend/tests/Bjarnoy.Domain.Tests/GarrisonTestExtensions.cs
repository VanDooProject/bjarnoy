using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Test helpers for garrisons that stand at spots: land units at the centre, ships at the first spot that can hold ships (a Dockyard,
/// or a harbouring centre), and dispatching from the spot the requested units stand at.
/// </summary>
internal static class GarrisonTestExtensions
{
    /// <summary>The spot <paramref name="stacks"/> are put at: the centre for land units, the first ship-holding spot for ships (else the centre).</summary>
    public static HexCoord SpotFor(this Settlement settlement, UnitType type) =>
        UnitCatalogue.Get(type).Class == UnitClass.Ship
            ? settlement.GarrisonSpots.FirstOrDefault(s => s.HoldsShips)?.Coord ?? settlement.Centre
            : settlement.Centre;

    /// <summary>This settlement with its whole garrison replaced by <paramref name="stacks"/>, each at the spot that suits it.</summary>
    public static Settlement WithGarrison(this Settlement settlement, IEnumerable<UnitStack> stacks) =>
        settlement with
        {
            SpotStacks =
            [
                .. stacks.Where(s => s.Count > 0)
                    .Select(s => new SpotStack(settlement.SpotFor(s.Type), s.Type, s.Count)),
            ],
        };

    /// <summary>The spot a dispatch of <paramref name="requested"/> leaves from: where the first requested type stands, else the spot that suits it.</summary>
    public static HexCoord SpotOf(this Settlement settlement, IEnumerable<UnitStack> requested)
    {
        var first = requested.FirstOrDefault(s => s.Count > 0);
        if (first.Count == 0)
        {
            return settlement.Centre;
        }

        return settlement.SpotSpotWith(first.Type) ?? settlement.SpotFor(first.Type);
    }

    private static HexCoord? SpotSpotWith(this Settlement settlement, UnitType type) =>
        settlement.GarrisonSpots.FirstOrDefault(s => s.Stacks.Any(g => g.Type == type && g.Count > 0))?.Coord;

    /// <summary>The old settlement-wide dispatch: from the spot the requested units stand at.</summary>
    public static SettlementDispatchDecision PlanDispatch(
        this Settlement settlement, IReadOnlyList<UnitStack> requestedUnits, double provisions, DateTimeOffset now) =>
        settlement.PlanDispatch(settlement.SpotOf(requestedUnits), requestedUnits, provisions, now);

    /// <summary>The old settlement-wide admin edit: at the spot that suits the unit type.</summary>
    public static AdminGarrisonEditResult AdjustGarrison(
        this Settlement settlement, UnitType type, int delta, DateTimeOffset now, double speedFactor = 1.0,
        IReadOnlyList<UnitStack>? guestStacks = null, Func<HexCoord, Terrain>? terrainAt = null) =>
        settlement.AdjustGarrison(settlement.SpotFor(type), type, delta, now, speedFactor, guestStacks, terrainAt);
}

/// <summary>Army planning as the tests used it before garrisons stood at spots: from wherever the requested units stand.</summary>
internal static class TestArmy
{
    public static DispatchDecision PlanDispatch(
        Settlement settlement,
        IReadOnlyList<UnitStack> requestedUnits,
        double provisions,
        IReadOnlyList<HexCoord> waypoints,
        HexCoord destination,
        DateTimeOffset now,
        Guid armyId,
        Func<HexCoord, Terrain> terrainAt,
        ArmyMission mission = ArmyMission.Move,
        Guid? targetSettlementId = null,
        HexCoord? targetBuildingCoord = null,
        IReadOnlyList<(HexCoord Centre, int Radius)>? targetClaimDiscs = null,
        Func<HexCoord, bool>? isHexFoundable = null,
        bool renownAndSlotAllowed = true,
        double speedFactor = 1.0,
        Func<HexCoord, bool>? isRiver = null,
        Func<HexCoord, bool>? isWideRiver = null,
        IGiantIndex? giants = null,
        WallRules? walls = null,
        HexCoord? targetCampCoord = null,
        bool targetCampIsWater = false,
        IReadOnlyList<GarrisonSpot>? targetSpots = null,
        HexCoord? fromSpot = null,
        bool targetCampIsSand = false,
        int routeSearchBudget = HexPathfinder.MaxExpandedNodes,
        bool isPremium = false) =>
        Army.PlanDispatch(
            settlement, fromSpot ?? settlement.SpotOf(requestedUnits), requestedUnits, provisions, waypoints, destination, now, armyId,
            terrainAt, mission, targetSettlementId, targetBuildingCoord, targetClaimDiscs, isHexFoundable, renownAndSlotAllowed,
            speedFactor, isRiver, isWideRiver, giants, walls, targetCampCoord, targetCampIsWater, targetCampIsSand, targetSpots,
            routeSearchBudget: routeSearchBudget, isPremium: isPremium);
}
