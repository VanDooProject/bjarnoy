using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only troop god-mode (issue #105): browse the armies in the field and
/// edit one directly — its units, its provisions, when its journey lands, and
/// which hex it stands on. Creating troops in the first place is a settlement
/// concern (a garrison), so it lives on
/// <see cref="AdminSettlementEndpoints"/>; everything here is about armies
/// that already exist.
/// </summary>
public static class AdminArmyEndpoints
{
    public static IEndpointRouteBuilder MapAdminArmyEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var armies = app.MapGroup("/api/v1/admin/armies")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Armies")
            .RequireAuthorization("Admin");

        armies.MapGet("/", List)
            .WithName("AdminListArmies")
            .WithSummary("Lists armies, filtered by world or by home settlement.");

        armies.MapPatch("/{armyId:guid}", Edit)
            .WithName("AdminEditArmy")
            .WithSummary("Edits an army's units, provisions, arrival time, or position.");

        return app;
    }

    private static async Task<Results<Ok<IReadOnlyList<AdminArmyResponse>>, ValidationProblem>> List(
        Guid? worldId,
        Guid? settlementId,
        ArmyService armies,
        WorldService worlds,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (worldId is null && settlementId is null)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(worldId)] = ["Give either a worldId or a settlementId to list armies for."],
            });
        }

        var entities = settlementId is { } settlement
            ? await armies.GetForSettlementAsync(settlement, cancellationToken)
            : await armies.GetForWorldAsync(worldId!.Value, cancellationToken);

        // Every army in the list belongs to one world (either the one asked
        // for, or the settlement's), so one clock covers the whole page —
        // positions and provisions are all read at the same game instant.
        var clocks = new Dictionary<Guid, GameClock>();
        var response = new List<AdminArmyResponse>(entities.Count);

        foreach (var entity in entities)
        {
            var entityWorldId = entity.Settlement!.WorldId;
            if (!clocks.TryGetValue(entityWorldId, out var clock))
            {
                var world = await worlds.GetWorldAsync(entityWorldId, cancellationToken);
                if (world is null)
                {
                    continue;
                }

                clock = world.ToClock();
                clocks[entityWorldId] = clock;
            }

            response.Add(AdminArmyResponse.From(entity, clock.ToGameTime(time.GetUtcNow())));
        }

        return TypedResults.Ok<IReadOnlyList<AdminArmyResponse>>(response);
    }

    private static async Task<Results<Ok<AdminArmyResponse>, NotFound, ValidationProblem>> Edit(
        Guid armyId,
        AdminEditArmyRequest request,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        List<UnitStack>? stacks = null;
        if (request.Units is { } units)
        {
            stacks = [];
            foreach (var line in units)
            {
                if (!ArmyEndpoints.TryParseUnit(line.Unit, out var type))
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                    {
                        [nameof(request.Units)] = [$"No such unit type: '{line.Unit}'."],
                    });
                }

                if (line.Count < 0)
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                    {
                        [nameof(request.Units)] = ["A unit count cannot be negative."],
                    });
                }

                stacks.Add(new UnitStack(type, line.Count));
            }
        }

        if (request.Provisions is < 0)
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Provisions)] = ["Provisions cannot be negative."],
            });
        }

        var result = await armies.AdminEditAsync(
            armyId,
            stacks,
            request.Provisions,
            arriveIn: request.ArriveInMinutes is { } minutes ? TimeSpan.FromMinutes(minutes) : null,
            teleportTo: request.Position?.ToHexCoord(),
            cancellationToken: cancellationToken);

        if (result.Outcome != AdminArmyEditOutcome.Applied)
        {
            return Failure(result.Outcome);
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(AdminArmyResponse.From(result.Army!, clock.ToGameTime(time.GetUtcNow())));
    }

    private static Results<Ok<AdminArmyResponse>, NotFound, ValidationProblem> Failure(AdminArmyEditOutcome outcome)
    {
        var (field, message) = outcome switch
        {
            AdminArmyEditOutcome.NoUnitsLeft =>
                ("units", "An army needs at least one unit; disband it by recalling it instead."),
            AdminArmyEditOutcome.NotTravelling =>
                ("arriveInMinutes", "This army is not travelling, so it has no arrival to move."),
            AdminArmyEditOutcome.UnreachableHex =>
                ("position", "This army cannot stand on that hex, or has no route home from it."),
            _ => (string.Empty, string.Empty),
        };

        if (field.Length == 0)
        {
            return TypedResults.NotFound();
        }

        return TypedResults.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });
    }
}
