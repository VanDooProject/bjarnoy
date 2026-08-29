using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
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
            .AddEndpointFilter<ActiveUserEndpointFilter>();

        settlements.MapGet("/{settlementId:guid}/armies", ListForSettlement)
            .WithName("ListSettlementArmies")
            .WithSummary("Lists the armies belonging to a settlement, home and in transit.");

        var armies = app.MapGroup("/api/v1/armies")
            .WithApiVersionSet(versionSet)
            .WithTags("Armies");

        armies.MapGet("/{armyId:guid}", Get)
            .WithName("GetArmy")
            .WithSummary("Fetches an army as of now, including its current position and route.");

        armies.MapPost("/{armyId:guid}/recall", Recall)
            .WithName("RecallArmy")
            .WithSummary("Turns an army around mid-journey to head home early.")
            .AddEndpointFilter<ActiveUserEndpointFilter>();

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

        var waypoints = (request.Waypoints ?? []).Select(w => w.ToHexCoord()).ToList();
        var destination = request.Destination.ToHexCoord();

        var result = await armies.DispatchAsync(
            settlementId, unitStacks, waypoints, destination, request.Provisions, cancellationToken);

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
        return result.Rejection == DispatchRejection.SettlementNotFound
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

        var found = await armies.GetAsync(armyId, cancellationToken);
        var (entity, clock) = found!.Value;
        return TypedResults.Ok(ArmyResponse.From(entity!, clock.ToGameTime(time.GetUtcNow())));
    }

    private static bool TryParseUnit(string value, out UnitType type)
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
                _ => "Refused.",
            },
            Status = StatusCodes.Status409Conflict,
        };

        problem.Extensions["rejection"] = rejection.ToString();
        return problem;
    }
}
