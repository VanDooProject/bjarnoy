using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Units;

namespace Bjarnoy.Api.Contracts;

/// <summary>
/// A premium fight simulation request (issue #40 phase 7) — calls
/// <see cref="BattleResolver.Resolve"/> (and, if applicable,
/// <see cref="SiegeResolver.Resolve"/>) directly with no settlement, army, or
/// database involved; see <c>SimulatorEndpoints</c>.
/// </summary>
/// <param name="AttackerStacks">The hypothetical attacking force.</param>
/// <param name="DefenderStacks">
/// The hypothetical home garrison to simulate against. Omit (or send empty)
/// to simulate an undefended settlement.
/// </param>
/// <param name="GuestDefenderStacks">
/// Optional guest (<see cref="ArmyMission.Support"/>) stacks to combine with
/// <paramref name="DefenderStacks"/> on the defense side, mirroring how a real
/// battle folds guest garrisons in — lets a premium user simulate "what if
/// this much support had arrived first".
/// </param>
/// <param name="TowerLevel">
/// The hypothetical defender's Tower level — converted to a defense bonus via
/// <see cref="Bjarnoy.Domain.Buildings.BuildingCatalogue.TowerDefenseBonusPercent"/>,
/// same as a real battle.
/// </param>
/// <param name="Mission">
/// <c>"attack"</c> (default) or <c>"raid"</c> — see <see cref="ArmyMission.Raid"/>
/// and <see cref="BattleResolver.Resolve"/>'s <c>raid</c> parameter for what
/// changes.
/// </param>
/// <param name="Seed">
/// The RNG seed <see cref="BattleResolver.Resolve"/> uses to break rounding
/// ties (see its own remarks) — omit to have the server pick one, exactly
/// like a real Attack/Raid dispatch does (<c>ArmyService.ResolveBattleAsync</c>'s
/// <c>Random.Shared.Next()</c>). Passing an explicit seed lets a caller
/// replay the exact same simulated outcome.
/// </param>
public sealed record SimulatorRequest(
    [property: Required, MinLength(1)] IReadOnlyList<UnitCountRequest> AttackerStacks,
    IReadOnlyList<UnitCountRequest>? DefenderStacks,
    IReadOnlyList<UnitCountRequest>? GuestDefenderStacks,
    [property: Range(0, int.MaxValue)] int TowerLevel = 0,
    string? Mission = null,
    int? Seed = null);

/// <summary>
/// The outcome of a premium fight simulation — deliberately the same field
/// shape as <see cref="BattleReportResponse"/> (minus the persistence-only
/// identity fields no simulated battle has: no id, no occurrence instant, no
/// army/settlement ids) so a future frontend can reuse the same report
/// component for both a real battle and a simulated one.
/// </summary>
/// <param name="Mission"><c>"attack"</c> or <c>"raid"</c> — which the request asked for.</param>
/// <param name="Siege">
/// Present only when the attacker's stacks included a
/// <see cref="UnitType.Catapult"/> and the attacker won. Since the simulator
/// models no real settlement, the siege is resolved against one nominal
/// level-1 Longhouse — see <c>SimulatorEndpoints</c>'s remarks — so this
/// previews the levels-destroyed math, not a real building's fate.
/// </param>
public sealed record SimulatorResponse(
    string Mission,
    string Winner,
    double AttackPower,
    double DefensePower,
    int Seed,
    ResourceAmountsResponse LootTaken,
    IReadOnlyList<BattleReportAttackerLineResponse> AttackerLines,
    IReadOnlyList<BattleReportDefenderLineResponse> DefenderLines,
    BattleReportSiegeResponse? Siege);
