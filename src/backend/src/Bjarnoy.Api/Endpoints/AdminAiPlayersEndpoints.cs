using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only AI player management (docs/design/ai-players.md's "API"
/// section): list every AI jarl with its objectives and settlements, take a
/// settlement over right now (skipping the inactivity threshold the periodic
/// sweep otherwise waits on), and edit an AI's personality/objective list.
/// </summary>
public static class AdminAiPlayersEndpoints
{
    public static IEndpointRouteBuilder MapAdminAiPlayersEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var aiPlayers = app.MapGroup("/api/v1/admin/ai-players")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "AiPlayers")
            .RequireAuthorization("Admin");

        aiPlayers.MapGet("/", ListAiPlayers)
            .WithName("AdminListAiPlayers")
            .WithSummary("Lists every AI jarl, with its objectives (met or not) and the settlements it holds.");

        aiPlayers.MapPut("/{userId:guid}", UpdateAiPlayer)
            .WithName("AdminUpdateAiPlayer")
            .WithSummary("Sets an AI player's personality and/or replaces its objective list.");

        app.MapPost("/api/v1/admin/settlements/{settlementId:guid}/ai", TakeOverSettlement)
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "AiPlayers")
            .RequireAuthorization("Admin")
            .WithName("AdminTakeOverSettlement")
            .WithSummary("Hands a settlement to a new AI jarl right now, skipping the inactivity threshold.");

        return app;
    }

    private static async Task<Ok<IReadOnlyList<AiPlayerAdminResponse>>> ListAiPlayers(
        AiPlayerService aiPlayers,
        CancellationToken cancellationToken)
    {
        var items = await aiPlayers.ListAsync(cancellationToken);

        IReadOnlyList<AiPlayerAdminResponse> response = [.. items.Select(AiPlayerAdminResponse.From)];

        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<AiPlayerAdminResponse>, NotFound, Conflict<ProblemDetails>, ValidationProblem>>
        TakeOverSettlement(
            Guid settlementId,
            TakeOverSettlementRequest? request,
            AiTakeoverService takeoverService,
            AiPlayerService aiPlayers,
            CancellationToken cancellationToken)
    {
        AiPersonality? personality = null;
        if (!string.IsNullOrWhiteSpace(request?.Personality))
        {
            if (!AiPersonalityExtensions.TryParseWireName(request.Personality, out var parsed))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Personality)] = [
                        $"'{request.Personality}' is not an AI personality. Valid: "
                            + $"{string.Join(", ", Enum.GetValues<AiPersonality>().Select(p => p.ToWireName()))}.",
                    ],
                });
            }

            personality = parsed;
        }

        var result = await takeoverService.TakeOverAsync(settlementId, personality, cancellationToken);

        switch (result.Outcome)
        {
            case TakeoverOutcome.NotFound:
                return TypedResults.NotFound();
            case TakeoverOutcome.NotAnonymous:
                return TypedResults.Conflict(new ProblemDetails
                {
                    Title = "That settlement is not eligible for takeover.",
                    Detail = "It is already owned by a real player or by another AI jarl.",
                    Status = StatusCodes.Status409Conflict,
                });
        }

        var item = await aiPlayers.GetAsync(result.AiPlayer!.UserId, cancellationToken);
        return TypedResults.Ok(AiPlayerAdminResponse.From(item!));
    }

    private static async Task<Results<Ok<AiPlayerAdminResponse>, NotFound, ValidationProblem>> UpdateAiPlayer(
        Guid userId,
        UpdateAiPlayerRequest request,
        AiPlayerService aiPlayers,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        AiPersonality? personality = null;
        if (request.Personality is not null)
        {
            if (!AiPersonalityExtensions.TryParseWireName(request.Personality, out var parsed))
            {
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Personality)] = [
                        $"'{request.Personality}' is not an AI personality. Valid: "
                            + $"{string.Join(", ", Enum.GetValues<AiPersonality>().Select(p => p.ToWireName()))}.",
                    ],
                });
            }

            personality = parsed;
        }

        List<AiObjective>? objectives = null;
        if (request.Objectives is not null)
        {
            objectives = [];
            for (var i = 0; i < request.Objectives.Count; i++)
            {
                var objectiveRequest = request.Objectives[i];

                if (!AiObjectiveKindExtensions.TryParseWireName(objectiveRequest.Kind, out var kind))
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                    {
                        [$"{nameof(request.Objectives)}[{i}].{nameof(objectiveRequest.Kind)}"] = [
                            $"'{objectiveRequest.Kind}' is not an AI objective kind. Valid: "
                                + $"{string.Join(", ", Enum.GetValues<AiObjectiveKind>().Select(k => k.ToWireName()))}.",
                        ],
                    });
                }

                if (objectiveRequest.Target <= 0)
                {
                    return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                    {
                        [$"{nameof(request.Objectives)}[{i}].{nameof(objectiveRequest.Target)}"] =
                            ["Target must be greater than zero."],
                    });
                }

                BuildingType? building = null;
                if (kind == AiObjectiveKind.ReachBuildingLevel)
                {
                    if (string.IsNullOrWhiteSpace(objectiveRequest.Building) || !TryParseBuilding(objectiveRequest.Building, out var parsedBuilding))
                    {
                        return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                        {
                            [$"{nameof(request.Objectives)}[{i}].{nameof(objectiveRequest.Building)}"] =
                                ["A reachbuildinglevel objective requires a valid building type."],
                        });
                    }

                    building = parsedBuilding;
                }

                TradeResource? resource = null;
                if (kind == AiObjectiveKind.ProductionRate)
                {
                    if (string.IsNullOrWhiteSpace(objectiveRequest.Resource) || !TryParseResource(objectiveRequest.Resource, out var parsedResource))
                    {
                        return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                        {
                            [$"{nameof(request.Objectives)}[{i}].{nameof(objectiveRequest.Resource)}"] =
                                ["A productionrate objective requires a valid resource."],
                        });
                    }

                    resource = parsedResource;
                }

                objectives.Add(new AiObjective
                {
                    Kind = kind,
                    Building = building,
                    Resource = resource,
                    Target = objectiveRequest.Target,
                });
            }
        }

        var (outcome, _) = await aiPlayers.UpdateAsync(userId, personality, objectives, cancellationToken);

        if (outcome == AiPlayerService.AiPlayerUpdateOutcome.NotFound)
        {
            return TypedResults.NotFound();
        }

        var item = await aiPlayers.GetAsync(userId, cancellationToken);
        return TypedResults.Ok(AiPlayerAdminResponse.From(item!));
    }

    /// <summary>Wire name (or enum name) to <see cref="BuildingType"/> — same lookup <see cref="AdminSettlementEndpoints"/> uses.</summary>
    private static bool TryParseBuilding(string value, out BuildingType type)
    {
        foreach (var candidate in BuildingCatalogue.AllTypes)
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

    /// <summary>Wire name (or enum name) to <see cref="TradeResource"/> — same lookup <see cref="TradeEndpoints"/> uses.</summary>
    private static bool TryParseResource(string value, out TradeResource resource)
    {
        foreach (var candidate in Enum.GetValues<TradeResource>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase)
                || string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                resource = candidate;
                return true;
            }
        }

        resource = default;
        return false;
    }
}
