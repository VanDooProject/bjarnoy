using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Armies;
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
/// <param name="Provisions">Food to load onto the army, capped by what its units can carry and what the settlement can afford.</param>
public sealed record DispatchArmyRequest(
    [property: Required, MinLength(1)] IReadOnlyList<UnitCountRequest> Units,
    IReadOnlyList<HexPointRequest>? Waypoints,
    [property: Required] HexPointRequest Destination,
    [property: Range(0, double.MaxValue)] double Provisions);

public sealed record ArmyUnitStackResponse(string Unit, int Count);

public sealed record HexPointResponse(int Q, int R)
{
    public static HexPointResponse From(HexCoord coord) => new(coord.Q, coord.R);
}

/// <param name="Path">Full outbound route, start and destination included — for a frontend to draw when the army is selected.</param>
public sealed record MovementResponse(
    DateTimeOffset DepartedAt,
    IReadOnlyList<HexPointResponse> Path,
    DateTimeOffset ArrivesAt,
    IReadOnlyList<HexPointResponse> ReturnPath,
    DateTimeOffset TurnAroundAt,
    DateTimeOffset ReturnArrivesAt,
    bool IsReturning)
{
    public static MovementResponse From(Movement movement) => new(
        movement.DepartedAt,
        [.. movement.Path.Select(HexPointResponse.From)],
        movement.ArrivesAt,
        [.. movement.ReturnPath.Select(HexPointResponse.From)],
        movement.TurnAroundAt,
        movement.ReturnArrivesAt,
        movement.IsReturning);
}

/// <param name="AtHome">True when the army is standing in its home settlement — <paramref name="Movement"/> is then null.</param>
/// <param name="Position">Current hex: the home settlement's centre while <paramref name="AtHome"/>, else the active leg's position as of now.</param>
public sealed record ArmyResponse(
    Guid Id,
    Guid SettlementId,
    string Mission,
    bool AtHome,
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
        var movement = domain.Location is ArmyLocation.InTransit inTransit ? inTransit.Movement : null;

        return new ArmyResponse(
            entity.Id,
            entity.SettlementId,
            domain.Mission.ToString().ToLowerInvariant(),
            atHome,
            HexPointResponse.From(domain.PositionAt(home, gameNow)),
            domain.ProvisionsAt(gameNow),
            domain.TotalSpeed,
            domain.TotalUpkeepPerHour,
            [.. domain.Stacks.Select(s => new ArmyUnitStackResponse(s.Type.ToWireName(), s.Count))],
            movement is null ? null : MovementResponse.From(movement));
    }
}

/// <summary>An army as it appears in a settlement's army list.</summary>
public sealed record ArmySummary(Guid Id, string Mission, bool AtHome, HexPointResponse Position)
{
    public static ArmySummary From(ArmyEntity entity, DateTimeOffset gameNow)
    {
        ArgumentNullException.ThrowIfNull(entity);
        ArgumentNullException.ThrowIfNull(entity.Settlement);

        var domain = entity.ToDomain();
        var home = new HexCoord(entity.Settlement.CentreQ, entity.Settlement.CentreR);
        var atHome = domain.Location is ArmyLocation.AtHome;

        return new ArmySummary(
            entity.Id, domain.Mission.ToString().ToLowerInvariant(), atHome,
            HexPointResponse.From(domain.PositionAt(home, gameNow)));
    }
}
