using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

internal static class TrainingTestExtensions
{
    /// <summary>
    /// Plans training in the first building of the unit's required type (the Longhouse hex when none stands), for tests where
    /// the building is not the point.
    /// </summary>
    public static TrainDecision PlanTrain(
        this Settlement settlement, UnitType type, int count, DateTimeOffset now, Guid orderId,
        bool hasShoreline = false, double costMultiplier = 1.0, double speedFactor = 1.0)
    {
        var required = UnitCatalogue.Get(type).RequiredBuildingType;
        var coord = settlement.Buildings.Where(b => b.Type == required).Select(b => b.Coord).DefaultIfEmpty(settlement.Centre).First();
        return settlement.PlanTrain(
            type, count, now, () => orderId, coord, TrainingSplit.Here, false, hasShoreline, costMultiplier, speedFactor);
    }
}
