using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Ai;

/// <summary>
/// One hex an AI's settlement claims, described the same way
/// <see cref="Settlement.PlanBuild"/> needs its terrain arguments — a
/// self-contained record so <see cref="AiPlanner"/> never has to reach back
/// into <see cref="World.TerrainSampler"/> itself (issue: the planner is pure
/// domain, no world generator access).
/// </summary>
public sealed record AiHex(HexCoord Coord, Terrain Terrain, bool IsCoastalWater, RiverTileShape? RiverShape);

/// <summary>
/// An attackable neighbour, as far as targeting is concerned — see
/// <c>docs/design/ai-players.md</c>'s "Targeting in v1" note: only other AI
/// players' settlements are ever listed here.
/// </summary>
public sealed record AiNeighbour(Guid SettlementId, HexCoord Centre, double EstimatedDefense);

/// <summary>
/// Everything <see cref="AiPlanner.Plan"/> needs to decide one AI player's
/// turn, gathered up front by the infrastructure layer (step 3) so the
/// planner itself never touches a database, a clock, or an unseeded
/// <see cref="Random"/>.
/// </summary>
/// <param name="Settlement">Already settled to <paramref name="Now"/> — see <see cref="Settlement.SettleTo"/>.</param>
/// <param name="SpeedFactor">The owning world's current speed factor.</param>
/// <param name="ClaimedHexes">Every hex this settlement claims, terrain included.</param>
/// <param name="Profile">The personality profile to plan against.</param>
/// <param name="Objectives">This AI's current (ordered) objective list — personality defaults or an admin override.</param>
/// <param name="Neighbours">Other AI players' settlements this one may target — see <see cref="AiNeighbour"/>.</param>
/// <param name="HasArmyAway">Whether this settlement already has an army out (raiding, marching, or otherwise away).</param>
/// <param name="HasShoreline">Whether this settlement's claimed territory includes a shoreline hex — see <see cref="Settlement.PlanTrain"/>'s <c>hasShoreline</c>.</param>
/// <param name="Seed">Seeds the planner's own deterministic tie-breaks. Never fed to <see cref="Random"/> for anything user-visible.</param>
/// <param name="SettlerCostMultiplier">
/// Carried for symmetry with <see cref="Settlement.PlanTrain"/>'s
/// <c>costMultiplier</c>, but unused today: the planner never trains
/// <see cref="Units.UnitType.SettlerCrew"/> (see <c>docs/design/ai-players.md</c>'s
/// "Out of scope" list — AI founding is a follow-up).
/// </param>
public sealed record AiSnapshot(
    Settlement Settlement,
    DateTimeOffset Now,
    double SpeedFactor,
    IReadOnlyList<AiHex> ClaimedHexes,
    AiProfile Profile,
    IReadOnlyList<AiObjective> Objectives,
    IReadOnlyList<AiNeighbour> Neighbours,
    bool HasArmyAway,
    bool HasShoreline,
    int Seed,
    double SettlerCostMultiplier = 1.0);
