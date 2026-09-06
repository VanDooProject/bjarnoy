using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Movement = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Api.Contracts;

public sealed record UnitCountRequest(
    [property: Required] string Unit,
    [property: Range(1, int.MaxValue)] int Count);

public sealed record HexPointRequest(int Q, int R)
{
    public HexCoord ToHexCoord() => new(Q, R);
}

/// <param name="Waypoints">Ordered intermediate hexes; empty/omitted for a direct route.</param>
/// <param name="Destination">
/// Required for a <c>"move"</c> mission (the default); ignored for
/// <c>"attack"</c>/<c>"support"</c>/<c>"raid"</c>, whose destination is always
/// the target settlement's own hex.
/// </param>
/// <param name="Provisions">
/// Food to load onto the army, capped by what its units can carry and what
/// the settlement can afford. Every mission, including <c>"support"</c>,
/// must cover the full round trip: a guest is fed by its host while there,
/// but a recalled guest walks home on whatever provisions it still carries,
/// with nobody feeding it on the way.
/// </param>
/// <param name="Mission">
/// <c>"move"</c> (default), <c>"attack"</c>, <c>"support"</c>, or
/// <c>"raid"</c> (issue #40 phase 7 — like <c>"attack"</c>, but the fight
/// breaks off early with reduced losses on both sides) — see
/// <see cref="ArmyMission"/>.
/// </param>
/// <param name="TargetSettlementId">
/// Required when <paramref name="Mission"/> is <c>"attack"</c>/<c>"raid"</c>
/// (the settlement to fight on arrival) or <c>"support"</c> (the settlement
/// to garrison as a guest on arrival).
/// </param>
/// <param name="TargetBuildingCoord">
/// Optional, only meaningful for <c>"attack"</c>/<c>"raid"</c> — the
/// coordinate of a building within the target settlement to hit with any
/// surviving catapults on arrival (issue #40 phase 5). Omit (or leave
/// <see langword="null"/>) for "no preference" —
/// <see cref="Bjarnoy.Domain.Combat.SiegeResolver"/> then picks uniformly at
/// random among whatever buildings the defender actually has standing when
/// the army arrives. Not validated against the target's actual layout here —
/// that can change before arrival — only that it was not given for a mission
/// with no battle to apply it in (see <see cref="Army.TargetBuildingCoord"/>'s
/// remarks).
/// </param>
public sealed record DispatchArmyRequest(
    [property: Required, MinLength(1)] IReadOnlyList<UnitCountRequest> Units,
    IReadOnlyList<HexPointRequest>? Waypoints,
    HexPointRequest? Destination,
    [property: Range(0, double.MaxValue)] double Provisions,
    string? Mission = null,
    Guid? TargetSettlementId = null,
    HexPointRequest? TargetBuildingCoord = null);

/// <summary>Redirects an in-transit or parked founding convoy to a different target hex (issue #55 §6).</summary>
public sealed record RetargetFoundingRequest([property: Required] HexPointRequest Target);

/// <summary>
/// Sends an army already out in the field onward to a new hex (issue #156
/// phase 1) — "move on" when it is standing at its current destination,
/// "append goal" when it is still travelling there. See
/// <see cref="Army.PlanFieldOrder"/> for the exact rules, including which of
/// the two this becomes and when waypoints require a premium account.
/// </summary>
/// <param name="Waypoints">Ordered intermediate hexes; empty/omitted for a direct route.</param>
/// <param name="Destination">The new hex to head for.</param>
public sealed record FieldOrderRequest(
    IReadOnlyList<HexPointRequest>? Waypoints,
    [property: Required] HexPointRequest Destination);

public sealed record ArmyUnitStackResponse(string Unit, int Count);

public sealed record HexPointResponse(int Q, int R)
{
    public static HexPointResponse From(HexCoord coord) => new(coord.Q, coord.R);
}

/// <param name="Path">Full outbound route, start and destination included — for a frontend to draw when the army is selected.</param>
/// <param name="CumulativeHours">
/// Game-hours elapsed to reach each hex of <paramref name="Path"/> from its
/// start (<c>[0]</c> is always 0, same length as <paramref name="Path"/>) —
/// see <see cref="Movement.CumulativeHours"/>. Exposed so a frontend can
/// interpolate an army's live position <em>per leg</em> rather than assuming a
/// uniform speed over the whole route: terrain makes legs cost wildly
/// different amounts of time, so a uniform-speed guess drifts visibly away
/// from the authoritative <c>Position</c> the backend reports (issue #94).
/// </param>
/// <param name="ReturnCumulativeHours">The same per-leg schedule for <paramref name="ReturnPath"/>, measured from <paramref name="TurnAroundAt"/>.</param>
public sealed record MovementResponse(
    DateTimeOffset DepartedAt,
    IReadOnlyList<HexPointResponse> Path,
    IReadOnlyList<double> CumulativeHours,
    DateTimeOffset ArrivesAt,
    IReadOnlyList<HexPointResponse> ReturnPath,
    IReadOnlyList<double> ReturnCumulativeHours,
    DateTimeOffset TurnAroundAt,
    DateTimeOffset ReturnArrivesAt,
    bool IsReturning)
{
    public static MovementResponse From(Movement movement) => new(
        movement.DepartedAt,
        [.. movement.Path.Select(HexPointResponse.From)],
        [.. movement.CumulativeHours],
        movement.ArrivesAt,
        [.. movement.ReturnPath.Select(HexPointResponse.From)],
        [.. movement.ReturnCumulativeHours],
        movement.TurnAroundAt,
        movement.ReturnArrivesAt,
        movement.IsReturning);
}

/// <param name="AtHome">True when the army is standing in its home settlement — <paramref name="Movement"/> is then null.</param>
/// <param name="Supporting">
/// True when the army is currently a guest garrison at
/// <paramref name="TargetSettlementId"/> (issue #40 phase 4) — mutually
/// exclusive with <paramref name="AtHome"/>; <paramref name="Movement"/> is
/// null here too, since a guest is not travelling.
/// </param>
/// <param name="Position">
/// Current hex: the home settlement's centre while <paramref name="AtHome"/>,
/// the host settlement's centre while <paramref name="Supporting"/>, else the
/// active leg's position as of now.
/// </param>
public sealed record ArmyResponse(
    Guid Id,
    Guid SettlementId,
    string Mission,
    Guid? TargetSettlementId,
    bool AtHome,
    bool Supporting,
    HexPointResponse Position,
    double Provisions,
    double TotalSpeed,
    double TotalUpkeepPerHour,
    IReadOnlyList<ArmyUnitStackResponse> Stacks,
    MovementResponse? Movement)
{
    public static ArmyResponse From(ArmyEntity entity, DateTimeOffset gameNow)
    {
        ArgumentNullException.ThrowIfNull(entity);
        ArgumentNullException.ThrowIfNull(entity.Settlement);

        var domain = entity.ToDomain();
        var home = new HexCoord(entity.Settlement.CentreQ, entity.Settlement.CentreR);
        var atHome = domain.Location is ArmyLocation.AtHome;
        var supporting = domain.Location is ArmyLocation.Supporting;
        var movement = domain.Location is ArmyLocation.InTransit inTransit ? inTransit.Movement : null;

        var position = domain.Location switch
        {
            ArmyLocation.InTransit transitLeg => transitLeg.Movement.PositionAt(gameNow),
            ArmyLocation.Supporting when entity.TargetSettlement is { } host => new HexCoord(host.CentreQ, host.CentreR),
            _ => home,
        };

        return new ArmyResponse(
            entity.Id,
            entity.SettlementId,
            domain.Mission.ToString().ToLowerInvariant(),
            domain.TargetSettlementId,
            atHome,
            supporting,
            HexPointResponse.From(position),
            domain.ProvisionsAt(gameNow),
            domain.TotalSpeed,
            domain.TotalUpkeepPerHour,
            [.. domain.Stacks.Select(s => new ArmyUnitStackResponse(s.Type.ToWireName(), s.Count))],
            movement is null ? null : MovementResponse.From(movement));
    }
}

/// <summary>An army as it appears in a settlement's army list.</summary>
public sealed record ArmySummary(Guid Id, string Mission, bool AtHome, bool Supporting, HexPointResponse Position)
{
    public static ArmySummary From(ArmyEntity entity, DateTimeOffset gameNow)
    {
        ArgumentNullException.ThrowIfNull(entity);
        ArgumentNullException.ThrowIfNull(entity.Settlement);

        var domain = entity.ToDomain();
        var home = new HexCoord(entity.Settlement.CentreQ, entity.Settlement.CentreR);
        var atHome = domain.Location is ArmyLocation.AtHome;
        var supporting = domain.Location is ArmyLocation.Supporting;

        var position = domain.Location switch
        {
            ArmyLocation.InTransit inTransit => inTransit.Movement.PositionAt(gameNow),
            ArmyLocation.Supporting when entity.TargetSettlement is { } host => new HexCoord(host.CentreQ, host.CentreR),
            _ => home,
        };

        return new ArmySummary(
            entity.Id, domain.Mission.ToString().ToLowerInvariant(), atHome, supporting,
            HexPointResponse.From(position));
    }
}

/// <summary>
/// A guest (<see cref="ArmyMission.Support"/>) army as the host settlement
/// sees it (issue #40 phase 4 §5) — counts only, since the host cannot
/// command it; the owner's own view is the ordinary <see cref="ArmyResponse"/>
/// via <see cref="ArmySummary"/> on their own settlement's army list.
/// </summary>
public sealed record GuestArmySummary(
    Guid ArmyId, Guid OwnerSettlementId, double TotalUpkeepPerHour, IReadOnlyList<ArmyUnitStackResponse> Stacks)
{
    public static GuestArmySummary From(ArmyEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);

        var domain = entity.ToDomain();
        return new GuestArmySummary(
            entity.Id,
            entity.SettlementId,
            domain.TotalUpkeepPerHour,
            [.. domain.Stacks.Select(s => new ArmyUnitStackResponse(s.Type.ToWireName(), s.Count))]);
    }
}

public sealed record ResourceAmountsResponse(double Wood, double Stone, double Food, double Iron)
{
    public static ResourceAmountsResponse From(ResourceAmounts amounts) =>
        new(amounts.Wood, amounts.Stone, amounts.Food, amounts.Iron);
}

public sealed record BattleReportAttackerLineResponse(string Unit, int Sent, int Lost, int Survived);

public sealed record BattleReportDefenderLineResponse(string Unit, int Lost, int Survived);

/// <summary>The building-damage section of a battle report (issue #40 phase 5) — present only when catapult damage actually happened.</summary>
public sealed record BattleReportSiegeResponse(
    HexPointResponse TargetCoord, string TargetType, int LevelBefore, int LevelAfter, bool SettlementRazed)
{
    public static BattleReportSiegeResponse? From(BattleReportSiegeLine? siege) =>
        siege is null
            ? null
            : new BattleReportSiegeResponse(
                HexPointResponse.From(siege.TargetCoord), siege.TargetType.ToWireName(),
                siege.LevelBefore, siege.LevelAfter, siege.SettlementRazed);
}

/// <summary>A resolved battle (issue #40 phase 3), as read from either side's inbox.</summary>
/// <param name="Mission">
/// <c>"attack"</c> or <c>"raid"</c> (issue #40 phase 7) — which mission fought
/// this battle; see <see cref="Domain.Armies.ArmyMission.Raid"/>.
/// </param>
public sealed record BattleReportResponse(
    Guid Id,
    DateTimeOffset OccurredAt,
    Guid AttackerArmyId,
    Guid AttackerSettlementId,
    Guid DefenderSettlementId,
    string Mission,
    string Winner,
    double AttackPower,
    double DefensePower,
    int Seed,
    ResourceAmountsResponse LootTaken,
    IReadOnlyList<BattleReportAttackerLineResponse> AttackerLines,
    IReadOnlyList<BattleReportDefenderLineResponse> DefenderLines,
    BattleReportSiegeResponse? Siege)
{
    public static BattleReportResponse From(BattleReportEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);

        var domain = entity.ToDomain();
        return new BattleReportResponse(
            domain.Id,
            domain.OccurredAt,
            domain.AttackerArmyId,
            domain.AttackerSettlementId,
            domain.DefenderSettlementId,
            domain.WasRaid ? "raid" : "attack",
            domain.Winner.ToString().ToLowerInvariant(),
            domain.AttackPower,
            domain.DefensePower,
            domain.Seed,
            ResourceAmountsResponse.From(domain.LootTaken),
            [.. domain.AttackerLines.Select(l => new BattleReportAttackerLineResponse(l.Type.ToWireName(), l.Sent, l.Lost, l.Survived))],
            [.. domain.DefenderLines.Select(l => new BattleReportDefenderLineResponse(l.Type.ToWireName(), l.Lost, l.Survived))],
            BattleReportSiegeResponse.From(domain.Siege));
    }
}
