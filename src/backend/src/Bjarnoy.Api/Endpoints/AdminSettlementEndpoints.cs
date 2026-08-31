using Asp.Versioning;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// Admin-only settlement god-mode (issue #30): search/inspect settlements,
/// grant or remove resources, and set a placed building's level directly —
/// all going through the same lazy-settle path players read from and write
/// through, so nothing here can diverge from the normal game rules on
/// production or capacity.
/// </summary>
public static class AdminSettlementEndpoints
{
    public static IEndpointRouteBuilder MapAdminSettlementEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var settlements = app.MapGroup("/api/v1/admin/settlements")
            .WithApiVersionSet(versionSet)
            .HasApiVersion(new ApiVersion(1, 0))
            .WithTags("Admin", "Settlements")
            .RequireAuthorization("Admin");

        settlements.MapGet("/", Search)
            .WithName("AdminSearchSettlements")
            .WithSummary("Searches settlements by world and/or owner name, paged.");

        settlements.MapGet("/{settlementId:guid}", Get)
            .WithName("AdminGetSettlement")
            .WithSummary("A settlement's detail as of now, stocks settled.");

        settlements.MapPost("/{settlementId:guid}/resources", GrantResources)
            .WithName("AdminGrantResources")
            .WithSummary("Grants (or, with negative values, removes) resources, settling first.");

        settlements.MapPut("/{settlementId:guid}/buildings/{q:int}/{r:int}/level", SetBuildingLevel)
            .WithName("AdminSetBuildingLevel")
            .WithSummary("Sets a placed building's level directly, recomputing rates like a normal build completion.");

        settlements.MapPost("/{settlementId:guid}/runes", GrantRune)
            .WithName("AdminGrantRune")
            .WithSummary(
                "Grants an unslotted rune to a settlement's storage — a stand-in for a real acquisition "
                    + "source (issue #53), which does not exist yet.");

        settlements.MapPost("/{settlementId:guid}/queue/complete", CompleteQueues)
            .WithName("AdminCompleteQueues")
            .WithSummary("Instant build: finishes everything queued right now, through the ordinary completion path.");

        settlements.MapGet("/{settlementId:guid}/layout", GetLayout)
            .WithName("AdminGetSettlementLayout")
            .WithSummary("Every claimed hex with its terrain and what stands on it — the graphical editor's canvas.");

        settlements.MapPut("/{settlementId:guid}/buildings/{q:int}/{r:int}", PlaceBuilding)
            .WithName("AdminPlaceBuilding")
            .WithSummary("Places, re-types or re-levels a building on a claimed hex, bypassing cost and queue.");

        settlements.MapDelete("/{settlementId:guid}/buildings/{q:int}/{r:int}", RazeBuilding)
            .WithName("AdminRazeBuilding")
            .WithSummary("Razes whatever stands on a hex. The longhouse cannot be razed.");

        settlements.MapPost("/{settlementId:guid}/garrison", AdjustGarrison)
            .WithName("AdminAdjustGarrison")
            .WithSummary("Creates (or, with a negative count, removes) garrison units directly.");

        return app;
    }

    private static async Task<Ok<PagedAdminSettlementsResponse>> Search(
        Guid? worldId,
        string? owner,
        int? page,
        int? pageSize,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        var effectivePage = page is > 0 ? page.Value : 1;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;

        var result = await settlements.SearchAsync(worldId, owner, effectivePage, effectivePageSize, cancellationToken);

        IReadOnlyList<AdminSettlementSummary> items = [.. result.Settlements.Select(AdminSettlementSummary.From)];

        return TypedResults.Ok(new PagedAdminSettlementsResponse(items, result.TotalCount, effectivePage, effectivePageSize));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound>> Get(
        Guid settlementId,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var found = await settlements.GetAsync(settlementId, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound();
        }

        var (entity, clock) = found.Value;
        return TypedResults.Ok(SettlementResponse.From(entity, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound>> GrantResources(
        Guid settlementId,
        GrantResourcesRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await settlements.GrantResourcesAsync(settlementId, request.ToDelta(), cancellationToken);

        if (!result.Accepted)
        {
            return TypedResults.NotFound();
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<CompleteQueuesResponse>, NotFound>> CompleteQueues(
        Guid settlementId,
        CompleteQueuesRequest? request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var builds = request?.Builds ?? true;
        var training = request?.Training ?? true;

        var result = await settlements.CompleteQueuesAsync(settlementId, builds, training, cancellationToken);
        if (!result.Accepted)
        {
            return TypedResults.NotFound();
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(new CompleteQueuesResponse(
            result.CompletedBuilds,
            result.CompletedTraining,
            SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow()))));
    }

    private static async Task<Results<Ok<AdminSettlementLayoutResponse>, NotFound>> GetLayout(
        Guid settlementId,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        var found = await settlements.GetAsync(settlementId, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound();
        }

        var (entity, _) = found.Value;
        var domain = entity.ToDomain();
        var sampler = new TerrainSampler(entity.World!.ToGenerationOptions());

        // The editor paints the whole claimed disc, not just the occupied
        // hexes: an empty buildable hex is exactly what an admin wants to
        // click on, and terrain is what decides whether anything may go there.
        IReadOnlyList<AdminSettlementHexResponse> hexes =
        [
            .. domain.Centre.WithinRadius(domain.ClaimRadius)
                .OrderBy(c => c.R).ThenBy(c => c.Q)
                .Select(coord =>
                {
                    var standing = domain.Buildings.FirstOrDefault(b => b.Coord == coord);
                    var occupied = domain.Buildings.Any(b => b.Coord == coord);

                    return new AdminSettlementHexResponse(
                        coord.Q,
                        coord.R,
                        sampler.TerrainAt(coord).ToWireName(),
                        sampler.IsCoastalWater(coord),
                        occupied ? standing.Type.ToWireName() : null,
                        occupied ? standing.Level : null,
                        coord == domain.Centre);
                }),
        ];

        return TypedResults.Ok(new AdminSettlementLayoutResponse(
            entity.Id,
            domain.ClaimRadius,
            hexes,
            [.. BuildingCatalogue.AllTypes.Select(t => t.ToWireName())],
            BuildingCatalogue.MaxLevel));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, ValidationProblem>> PlaceBuilding(
        Guid settlementId,
        int q,
        int r,
        PlaceBuildingRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseBuilding(request.Building, out var type))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Building)] = ["No such building type."],
            });
        }

        var result = await settlements.PlaceBuildingAsync(
            settlementId, new HexCoord(q, r), type, request.Level, cancellationToken);

        return BuildingEditResult(result, request.Level, time);
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, ValidationProblem>> RazeBuilding(
        Guid settlementId,
        int q,
        int r,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var result = await settlements.RazeBuildingAsync(settlementId, new HexCoord(q, r), cancellationToken);

        return BuildingEditResult(result, level: null, time);
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, ValidationProblem>> AdjustGarrison(
        Guid settlementId,
        AdjustGarrisonRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseUnit(request.Unit, out var unitType))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Unit)] = ["No such unit type."],
            });
        }

        var result = await settlements.AdjustGarrisonAsync(settlementId, unitType, request.Count, cancellationToken);

        switch (result.Outcome)
        {
            case AdminEditOutcome.SettlementNotFound:
                return TypedResults.NotFound();
            case AdminEditOutcome.Rejected:
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Count)] = [result.Rejection switch
                    {
                        AdminGarrisonEditRejection.InvalidCount => "A count of zero changes nothing.",
                        AdminGarrisonEditRejection.NotEnoughUnits =>
                            "The garrison does not hold that many units of that type.",
                        _ => "The garrison could not be adjusted.",
                    }],
                });
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(
            SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    /// <summary>Shared shaping of a <see cref="AdminBuildingEditServiceResult"/> into the two rejection HTTP shapes and the happy one.</summary>
    private static Results<Ok<SettlementResponse>, NotFound, ValidationProblem> BuildingEditResult(
        AdminBuildingEditServiceResult result, int? level, TimeProvider time)
    {
        switch (result.Outcome)
        {
            case AdminEditOutcome.SettlementNotFound:
                return TypedResults.NotFound();

            case AdminEditOutcome.Rejected:
                var (field, message) = result.Rejection switch
                {
                    AdminBuildingEditRejection.HexNotInSettlement =>
                        ("coord", "That hex is outside the settlement's claimed radius."),
                    AdminBuildingEditRejection.InvalidLevel =>
                        (level is null ? "coord" : "level", "That level is outside the building's valid range."),
                    AdminBuildingEditRejection.TerrainNotAllowed =>
                        ("building", "That building cannot stand on that hex's terrain."),
                    AdminBuildingEditRejection.BuildingNotFound =>
                        ("coord", "No building stands on that hex."),
                    AdminBuildingEditRejection.LonghouseIsFixed =>
                        ("building", "A settlement has exactly one longhouse, on the hex it was founded on."),
                    _ => ("coord", "The building could not be changed."),
                };

                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [field] = [message],
                });
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(
            SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    /// <summary>Wire name (or enum name) to <see cref="BuildingType"/> — same lookup <see cref="SettlementEndpoints"/> uses for a player's build.</summary>
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

    private static async Task<Results<Ok<SettlementResponse>, NotFound, ValidationProblem>> SetBuildingLevel(
        Guid settlementId,
        int q,
        int r,
        SetBuildingLevelRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await settlements.SetBuildingLevelAsync(
            settlementId, new HexCoord(q, r), request.Level, cancellationToken);

        switch (result.Outcome)
        {
            case SetBuildingLevelOutcome.SettlementNotFound:
                return TypedResults.NotFound();
            case SetBuildingLevelOutcome.BuildingNotFound:
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["coord"] = ["No building stands on that hex."],
                });
            case SetBuildingLevelOutcome.InvalidLevel:
                return TypedResults.ValidationProblem(new Dictionary<string, string[]>
                {
                    [nameof(request.Level)] = ["That level is outside the building's valid range."],
                });
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, ValidationProblem>> GrantRune(
        Guid settlementId,
        GrantRuneRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseRuneType(request.Type, out var type))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Type)] = [
                    $"'{request.Type}' is not a rune. Valid: "
                        + $"{string.Join(", ", Enum.GetValues<RuneType>().Select(t => t.ToWireName()))}.",
                ],
            });
        }

        if (!TryParseRuneRarity(request.Rarity, out var rarity))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]>
            {
                [nameof(request.Rarity)] = [
                    $"'{request.Rarity}' is not a rarity. Valid: "
                        + $"{string.Join(", ", Enum.GetValues<RuneRarity>().Select(r => r.ToWireName()))}.",
                ],
            });
        }

        var result = await settlements.GrantRuneAsync(settlementId, type, rarity, cancellationToken);
        if (!result.Accepted)
        {
            return TypedResults.NotFound();
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static bool TryParseRuneType(string value, out RuneType type)
    {
        foreach (var candidate in Enum.GetValues<RuneType>())
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

    private static bool TryParseRuneRarity(string value, out RuneRarity rarity)
    {
        foreach (var candidate in Enum.GetValues<RuneRarity>())
        {
            if (string.Equals(candidate.ToWireName(), value, StringComparison.OrdinalIgnoreCase)
                || string.Equals(candidate.ToString(), value, StringComparison.OrdinalIgnoreCase))
            {
                rarity = candidate;
                return true;
            }
        }

        rarity = default;
        return false;
    }
}
