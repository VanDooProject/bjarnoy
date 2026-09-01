using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

public static class ArmyEndpoints
{
    public static IEndpointRouteBuilder MapArmyEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var settlements = app.MapGroup("/api/v1/settlements")
            .WithApiVersionSet(versionSet)
            .WithTags("Armies");

        settlements.MapPost("/{settlementId:guid}/armies", Dispatch)
            .WithName("DispatchArmy")
            .WithSummary("Dispatches units from a settlement's garrison on a move mission.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .AddEndpointFilter<SettlementOwnershipEndpointFilter>()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        settlements.MapGet("/{settlementId:guid}/armies", ListForSettlement)
            .WithName("ListSettlementArmies")
            .WithSummary("Lists the armies belonging to a settlement — home, in transit, or currently supporting elsewhere.");

        settlements.MapGet("/{settlementId:guid}/guests", ListGuestArmies)
            .WithName("ListGuestArmies")
            .WithSummary("Lists guest (support) armies currently stationed at a settlement — the host's view; counts only.");

        var armies = app.MapGroup("/api/v1/armies")
            .WithApiVersionSet(versionSet)
            .WithTags("Armies");

        armies.MapGet("/{armyId:guid}", Get)
            .WithName("GetArmy")
            .WithSummary("Fetches an army as of now, including its current position and route.");

        armies.MapPost("/{armyId:guid}/recall", Recall)
            .WithName("RecallArmy")
            .WithSummary("Turns an army around mid-journey to head home early.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .AddEndpointFilter<ArmyOwnershipEndpointFilter>()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        armies.MapPost("/{armyId:guid}/retarget-founding", RetargetFounding)
            .WithName("RetargetFoundingConvoy")
            .WithSummary("Redirects an in-transit or parked founding convoy to a different target hex (issue #55).")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .AddEndpointFilter<ArmyOwnershipEndpointFilter>();

        var reports = app.MapGroup("/api/v1")
            .WithApiVersionSet(versionSet)
            .WithTags("Battle reports");

        reports.MapGet("/reports/{reportId:guid}", GetReport)
            .WithName("GetBattleReport")
            .WithSummary("Fetches one battle report by id.");

        reports.MapGet("/settlements/{settlementId:guid}/reports", ListReportsForSettlement)
            .WithName("ListSettlementBattleReports")
            .WithSummary("Lists battle reports touching a settlement, as attacker or defender, newest first.");

        return app;
    }

    private static async Task<Results<Created<ArmyResponse>, NotFound, Conflict<ProblemDetails>, BadRequest<ProblemDetails>>> Dispatch(
        Guid settlementId,
        DispatchArmyRequest request,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var unitStacks = new List<UnitStack>();
        foreach (var unit in request.Units)
        {
            if (!TryParseUnit(unit.Unit, out var type))
            {
                return TypedResults.BadRequest(new ProblemDetails
                {
                    Title = "Unknown unit.",
                    Detail = $"'{unit.Unit}' is not a unit. "
                        + $"Valid: {string.Join(", ", UnitCatalogue.AllTypes.Select(t => t.ToWireName()))}.",
                    Status = StatusCodes.Status400BadRequest,
                });
            }

            unitStacks.Add(new UnitStack(type, unit.Count));
        }

        if (!TryParseMission(request.Mission, out var mission))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown mission.",
                Detail = $"'{request.Mission}' is not a mission. Valid: move, attack, support, raid, found.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var waypoints = (request.Waypoints ?? []).Select(w => w.ToHexCoord()).ToList();
        var destination = request.Destination?.ToHexCoord();

        var result = await armies.DispatchAsync(
            settlementId, unitStacks, waypoints, destination, request.Provisions,
            mission, request.TargetSettlementId, request.TargetBuildingCoord?.ToHexCoord(), cancellationToken);

        if (result.WorldPaused)
        {
            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "The world is not accepting commands.",
                Detail = "It is paused, locked or under maintenance.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        if (result.Accepted)
        {
            var found = await armies.GetAsync(result.Army!.Id, cancellationToken);
            var (entity, clock) = found!.Value;

            return TypedResults.Created(
                $"/api/v1/armies/{entity!.Id}",
                ArmyResponse.From(entity, clock.ToGameTime(time.GetUtcNow())));
        }

        var problem = Problem(result.Rejection);
        return result.Rejection is DispatchRejection.SettlementNotFound or DispatchRejection.TargetSettlementNotFound
            ? TypedResults.NotFound()
            : TypedResults.Conflict(problem);
    }

    private static async Task<Results<Ok<ArmyResponse>, NotFound>> Get(
        Guid armyId,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var found = await armies.GetAsync(armyId, cancellationToken);
        if (found is null || found.Value.Army is null)
        {
            // Either never existed, or its journey completed and it was
            // folded back into the garrison during this settle — either way
            // there is nothing left to fetch under this id.
            return TypedResults.NotFound();
        }

        var (entity, clock) = found.Value;
        return TypedResults.Ok(ArmyResponse.From(entity!, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Ok<IReadOnlyList<ArmySummary>>> ListForSettlement(
        Guid settlementId,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var entities = await armies.GetForSettlementAsync(settlementId, cancellationToken);

        // Not settled here — same "reading is not settling" reasoning as
        // SettlementService.GetForWorldAsync; PositionAt/ProvisionsAt are
        // pure reads so the list is still live without a write per row.
        var now = time.GetUtcNow();

        IReadOnlyList<ArmySummary> response = [.. entities.Select(e => ArmySummary.From(e, now))];
        return TypedResults.Ok(response);
    }

    private static async Task<Ok<IReadOnlyList<GuestArmySummary>>> ListGuestArmies(
        Guid settlementId,
        ArmyService armies,
        CancellationToken cancellationToken)
    {
        var entities = await armies.GetGuestArmiesAsync(settlementId, cancellationToken);
        IReadOnlyList<GuestArmySummary> response = [.. entities.Select(GuestArmySummary.From)];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<ArmyResponse>, NotFound, Conflict<ProblemDetails>>> Recall(
        Guid armyId,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var result = await armies.RecallAsync(armyId, cancellationToken);

        if (result.Outcome == RecallOutcome.ArmyNotFound)
        {
            return TypedResults.NotFound();
        }

        if (result.Outcome == RecallOutcome.NothingToRecall)
        {
            if (result.Army is null)
            {
                // Arrived home during this very settle — no army left to recall.
                return TypedResults.NotFound();
            }

            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "Nothing to recall.",
                Detail = "The army is already heading home.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        if (result.Outcome == RecallOutcome.NoRouteHome)
        {
            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "No route home.",
                Detail = "The army cannot be recalled: no route home exists from where it currently is.",
                Status = StatusCodes.Status409Conflict,
            });
        }

        var found = await armies.GetAsync(armyId, cancellationToken);
        var (entity, clock) = found!.Value;
        return TypedResults.Ok(ArmyResponse.From(entity!, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<ArmyResponse>, NotFound, Conflict<ProblemDetails>>> RetargetFounding(
        Guid armyId,
        RetargetFoundingRequest request,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await armies.RetargetFoundingAsync(armyId, request.Target.ToHexCoord(), cancellationToken);

        if (result.ArmyNotFound)
        {
            return TypedResults.NotFound();
        }

        if (!result.Accepted)
        {
            var detail = result.Rejection switch
            {
                RetargetFoundingRejection.NotAFoundingMission => "This army is not on a founding mission.",
                RetargetFoundingRejection.NothingToRetarget =>
                    "The convoy is already returning, already home, or arrived home during this settle.",
                RetargetFoundingRejection.TargetNotReachable => "No route exists to the new target hex.",
                RetargetFoundingRejection.InsufficientProvisionsForRoundTrip =>
                    "The provisions remaining would not cover the round trip to the new target.",
                _ => "Refused.",
            };

            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "The retarget was refused.",
                Detail = detail,
                Status = StatusCodes.Status409Conflict,
            });
        }

        var found = await armies.GetAsync(armyId, cancellationToken);
        var (entity, clock) = found!.Value;
        return TypedResults.Ok(ArmyResponse.From(entity!, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<BattleReportResponse>, NotFound>> GetReport(
        Guid reportId,
        BattleReportService reports,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetAsync(reportId, cancellationToken);
        return report is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(BattleReportResponse.From(report));
    }

    private static async Task<Ok<IReadOnlyList<BattleReportResponse>>> ListReportsForSettlement(
        Guid settlementId,
        BattleReportService reports,
        CancellationToken cancellationToken)
    {
        var entities = await reports.GetForSettlementAsync(settlementId, cancellationToken);
        IReadOnlyList<BattleReportResponse> response = [.. entities.Select(BattleReportResponse.From)];
        return TypedResults.Ok(response);
    }

    /// <summary>Internal, not private: reused by <see cref="SimulatorEndpoints"/> to parse the simulator's own attack/raid mission field.</summary>
    internal static bool TryParseMission(string? value, out ArmyMission mission)
    {
        if (string.IsNullOrWhiteSpace(value) || string.Equals(value, "move", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.Move;
            return true;
        }

        if (string.Equals(value, "attack", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.Attack;
            return true;
        }

        if (string.Equals(value, "support", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.Support;
            return true;
        }

        if (string.Equals(value, "raid", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.Raid;
            return true;
        }

        if (string.Equals(value, "found", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.Found;
            return true;
        }

        mission = default;
        return false;
    }

    /// <summary>Internal, not private: reused by <see cref="SimulatorEndpoints"/> to parse its own attacker/defender unit stacks.</summary>
    internal static bool TryParseUnit(string value, out UnitType type)
    {
        foreach (var candidate in UnitCatalogue.AllTypes)
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase)
                || string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                type = candidate;
                return true;
            }
        }

        type = default;
        return false;
    }

    private static ProblemDetails Problem(DispatchRejection rejection)
    {
        var problem = new ProblemDetails
        {
            Title = "The dispatch was refused.",
            Detail = rejection switch
            {
                DispatchRejection.NoUnitsRequested => "At least one unit must be requested.",
                DispatchRejection.InsufficientGarrison => "The garrison does not hold that many of one or more requested unit types.",
                DispatchRejection.ProvisionsExceedCarryCapacity => "The requested provisions exceed what these units can carry.",
                DispatchRejection.InsufficientResources => "Not enough food to load the requested provisions.",
                DispatchRejection.DestinationNotLand => "The destination is not land; sea pathing is not supported yet.",
                DispatchRejection.WaypointNotLand => "A waypoint is not land; sea pathing is not supported yet.",
                DispatchRejection.UnreachableLeg => "No land route exists for one or more legs of the journey.",
                DispatchRejection.InsufficientProvisionsForRoundTrip =>
                    "The loaded provisions would not cover the full round trip's upkeep.",
                DispatchRejection.InsufficientProvisionsForTrip =>
                    "The loaded provisions would not cover the one-way trip plus the support reserve.",
                DispatchRejection.TargetSettlementRequired => "This mission requires a target settlement.",
                DispatchRejection.TargetSettlementNotFound => "The target settlement does not exist.",
                DispatchRejection.CannotAttackOwnSettlement => "An army cannot attack its own settlement.",
                DispatchRejection.CannotSupportOwnSettlement => "An army cannot support its own settlement.",
                DispatchRejection.DestinationRequired => "A move mission requires a destination.",
                DispatchRejection.TargetBuildingRequiresAttackMission =>
                    "A target building may only be given for an attack mission.",
                DispatchRejection.MixedFleetAndLandUnits =>
                    "An army must be either all ships or all non-ships, not a mix.",
                DispatchRejection.DestinationNotSea => "The destination is not sea; fleets can only path over water.",
                DispatchRejection.WaypointNotSea => "A waypoint is not sea; fleets can only path over water.",
                DispatchRejection.DefenderHasNoShoreline =>
                    "The target settlement is fully inland and cannot be reached by ship.",
                DispatchRejection.WrongSettlerCrewCount =>
                    "A founding mission requires exactly 3 settler crews, no more, no fewer.",
                DispatchRejection.InsufficientShipCapacityForSettlers =>
                    "The ships in this convoy cannot carry this many settler crews (Karve: 1, Longship: 2).",
                DispatchRejection.RenownOrSettlementSlotRequirementNotMet =>
                    "Not enough renown for another settlement yet, or founding requires a real account.",
                DispatchRejection.TargetHexNotFoundable =>
                    "The target hex is too close to an already-claimed settlement's border.",
                _ => "Refused.",
            },
            Status = StatusCodes.Status409Conflict,
        };

        problem.Extensions["rejection"] = rejection.ToString();
        return problem;
    }
}
