using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// One intent <see cref="AiPlanner.Plan"/> decided on. The executor (step 3,
/// infrastructure) carries each of these out through the same service methods
/// a real player uses — <c>SettlementService.QueueBuildAsync</c>,
/// <c>TrainUnitsAsync</c> and <c>ArmyService.DispatchAsync</c> — so an AI gets
/// no resource grants, no instant builds and no special rules. A rejected
/// intent (the world changed between planning and execution) is logged and
/// skipped there, not retried here.
/// </summary>
public abstract record AiAction;

/// <summary>Place or upgrade a building on <paramref name="Coord"/>.</summary>
public sealed record AiBuild(BuildingType Type, HexCoord Coord) : AiAction;

/// <summary>Train <paramref name="Count"/> of <paramref name="Unit"/> at the settlement.</summary>
public sealed record AiTrain(UnitType Unit, int Count) : AiAction;

/// <summary>Send a raid of <paramref name="Units"/> against <paramref name="TargetSettlementId"/>.</summary>
public sealed record AiRaid(Guid TargetSettlementId, IReadOnlyList<UnitStack> Units) : AiAction;
