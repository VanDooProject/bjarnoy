using System.Security.Claims;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;
using Bjarnoy.Infrastructure.World;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

public static class SettlementEndpoints
{
    public static IEndpointRouteBuilder MapSettlementEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        var worlds = app.MapGroup("/api/v1/worlds")
            .WithApiVersionSet(versionSet)
            .WithTags("Settlements");

        worlds.MapPost("/{worldId:guid}/settlements", Found)
            .WithName("FoundSettlement")
            .WithSummary("Founds a settlement on one of an island's start positions.")
            // Mutating: a Locked/Banned authenticated caller is refused, but
            // anonymous play is unaffected — see ActiveUserEndpointFilter.
            // No SettlementOwnershipEndpointFilter here: founding is what
            // *establishes* ownership (OwnerId/OwnerName in the request
            // body), so there is nothing to own yet at this point — see
            // QueueBuild/TrainUnits below for where that filter applies.
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        worlds.MapGet("/{worldId:guid}/settlements", ListForWorld)
            .WithName("ListWorldSettlements")
            .WithSummary("Lists this caller's own settlements plus every rival settlement they have explored.")
            .RequireCallerRealm();

        var settlements = app.MapGroup("/api/v1/settlements")
            .WithApiVersionSet(versionSet)
            .WithTags("Settlements");

        settlements.MapGet("/{settlementId:guid}", Get)
            .WithName("GetSettlement")
            .WithSummary("Fetches a settlement as of now, completing anything its queue owed.")
            // Full read (stock/rates/queues/garrison/runes) — owner only. A
            // rival is offered GetView below instead, fog-gated and without
            // any of that.
            .RequireSettlementOwner();

        settlements.MapGet("/{settlementId:guid}/view", GetView)
            .WithName("GetSettlementView")
            .WithSummary("A fog-gated read of any settlement whose ground the caller has explored.")
            .RequireCallerRealm();

        settlements.MapPost("/{settlementId:guid}/builds", QueueBuild)
            .WithName("QueueBuild")
            .WithSummary("Queues a building, charging its cost immediately.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        settlements.MapPost("/{settlementId:guid}/builds/{orderId:guid}/cancel", CancelBuild)
            .WithName("CancelBuild")
            .WithSummary("Cancels a still-queued build order, refunding its cost.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        settlements.MapPost("/{settlementId:guid}/units", TrainUnits)
            .WithName("TrainUnits")
            .WithSummary("Queues training a batch of units, charging their cost immediately.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        settlements.MapPost("/{settlementId:guid}/runes/{runeId:guid}/slot", SlotRune)
            .WithName("SlotRune")
            .WithSummary("Slots an unslotted rune into the shrine standing on a hex.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        settlements.MapPost("/{settlementId:guid}/runes/{runeId:guid}/unslot", UnslotRune)
            .WithName("UnslotRune")
            .WithSummary("Returns a slotted rune to storage.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>();

        app.MapGet("/api/v1/buildings", Catalogue)
            .WithApiVersionSet(versionSet)
            .WithTags("Settlements")
            .WithName("GetBuildingCatalogue")
            .WithSummary("The build options: costs, durations, and the terrain each may stand on.");

        app.MapGet("/api/v1/units", UnitsCatalogue)
            .WithApiVersionSet(versionSet)
            .WithTags("Settlements")
            .WithName("GetUnitCatalogue")
            .WithSummary("The unit roster: stats, training costs, and prerequisites.");

        return app;
    }

    private static async Task<Results<Created<SettlementResponse>, NotFound<ProblemDetails>,
        Conflict<ProblemDetails>, BadRequest<ProblemDetails>>> Found(
        Guid worldId,
        FoundSettlementRequest request,
        HttpContext httpContext,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        // A caller founding while already logged in should own the new
        // settlement outright, not land it in the Abandoned/unclaimed limbo
        // meant for players who have no account yet — see
        // SettlementService.FoundAsync's callerUserId remarks.
        var user = httpContext.User;
        var idClaim = user.Identity?.IsAuthenticated == true
            ? user.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;
        Guid? callerUserId = Guid.TryParse(idClaim, out var parsedUserId) ? parsedUserId : null;

        var result = await settlements.FoundAsync(
            worldId,
            request.IslandId,
            new HexCoord(request.Q, request.R),
            request.Name,
            request.OwnerName,
            request.OwnerId,
            callerUserId,
            cancellationToken);

        if (result.Accepted)
        {
            var found = await settlements.GetAsync(result.Settlement!.Id, cancellationToken);
            var (entity, clock) = found!.Value;

            return TypedResults.Created(
                $"/api/v1/settlements/{entity.Id}",
                SettlementResponse.From(entity, clock, clock.ToGameTime(time.GetUtcNow())));
        }

        var problem = Problem(result.Rejection);
        return result.Rejection switch
        {
            FoundingRejection.WorldNotFound or FoundingRejection.IslandNotFound =>
                TypedResults.NotFound(problem),
            FoundingRejection.PlotTaken or FoundingRejection.TooCloseToNeighbour
                or FoundingRejection.WorldFull or FoundingRejection.WorldPaused
                or FoundingRejection.NotAStartPosition or FoundingRejection.AlreadyFounded
                or FoundingRejection.WorldNotActive or FoundingRejection.JoinsClosed
                or FoundingRejection.NotStartedYet or FoundingRejection.PlotReserved =>
                TypedResults.Conflict(problem),
            _ => TypedResults.BadRequest(problem),
        };
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound<ProblemDetails>>> Get(
        Guid settlementId,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var found = await settlements.GetAsync(settlementId, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound(SettlementNotFoundProblem());
        }

        var (entity, clock) = found.Value;
        return TypedResults.Ok(
            SettlementResponse.From(entity, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    /// <summary>
    /// The rival-safe counterpart to <see cref="Get"/>: identity, position and
    /// buildings only, and only once the caller has actually explored this
    /// settlement's own centre hex — see <see cref="SettlementViewResponse"/>.
    /// Resolves the caller's realm the same way the per-world reads in
    /// <see cref="WorldEndpoints"/> do (<see cref="CallerRealmResolver"/>): no
    /// realm at all is refused rather than answered with an empty view, since
    /// (unlike <c>ListForWorld</c>) a single settlement id is already a
    /// specific ask, not a passive listing an anonymous landing-page visitor
    /// happens to poll.
    /// </summary>
    private static async Task<IResult> GetView(
        Guid settlementId,
        HttpContext httpContext,
        SettlementService settlements,
        ExploredAreaService exploredArea,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var found = await settlements.GetAsync(settlementId, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound(SettlementNotFoundProblem());
        }

        var (entity, _) = found.Value;

        var realm = await CallerRealmResolver.ResolveAsync(httpContext, entity.WorldId, realms, cancellationToken);
        if (realm.Outcome != CallerRealmOutcome.Resolved)
        {
            // MissingHeader/Refused: nothing to check explored ground
            // against — same 403 the fog-mask/plot-suggestion reads answer
            // with for the same two outcomes.
            return NotOwnerRefusal();
        }

        var area = await exploredArea.GetAsync(entity.WorldId, realm.OwnerId!, persist: false, cancellationToken);
        if (area is null)
        {
            // The world resolved a moment ago but is gone by the time this
            // read actually ran — same "stopped existing under us" case
            // WorldEndpoints' reads recover from.
            return TypedResults.NotFound(WorldNotFoundProblem());
        }

        var isOwnSettlement = string.Equals(entity.OwnerId, realm.OwnerId, StringComparison.Ordinal);
        if (!isOwnSettlement && !area.Hexes.Contains(new HexCoord(entity.CentreQ, entity.CentreR)))
        {
            // Never reveal that an unexplored settlement even exists.
            return TypedResults.NotFound(SettlementNotFoundProblem());
        }

        IReadOnlyList<PlacedBuildingResponse> buildings =
        [
            .. entity.Buildings
                .Where(b => isOwnSettlement || area.Hexes.Contains(new HexCoord(b.Q, b.R)))
                .Select(b => new PlacedBuildingResponse(b.Q, b.R, b.Type.ToWireName(), b.Level)),
        ];

        return TypedResults.Ok(new SettlementViewResponse(
            entity.Id,
            entity.Name,
            entity.OwnerName,
            entity.CentreQ,
            entity.CentreR,
            entity.ToDomain().LonghouseLevel,
            entity.IslandId,
            buildings));
    }

    /// <summary>
    /// Fog-gated per <c>docs/design/map-fog-v2.md</c>: a caller with no
    /// resolvable realm at all (an anonymous landing-page visitor — the
    /// frontend polls this before founding) just sees nothing, same
    /// reasoning <see cref="WorldEndpoints.GetMembership"/> gives for
    /// treating <see cref="CallerRealmOutcome.Refused"/> as "no realm here"
    /// rather than a 403/400 — this is a passive listing, not a specific
    /// ask. Otherwise: the caller's own settlements (every realm they hold,
    /// not just their primary one — settler-convoy foundings can leave a
    /// player with several) plus every settlement whose centre hex is in
    /// their explored area (<see cref="ExploredAreaService"/>) — exactly
    /// what their own fog mask/world map already shows them.
    /// </summary>
    private static async Task<Ok<IReadOnlyList<SettlementSummary>>> ListForWorld(
        Guid worldId,
        HttpContext httpContext,
        SettlementService settlements,
        ExploredAreaService exploredArea,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome != CallerRealmOutcome.Resolved)
        {
            return TypedResults.Ok<IReadOnlyList<SettlementSummary>>([]);
        }

        var area = await exploredArea.GetAsync(worldId, realm.OwnerId!, persist: false, cancellationToken);
        if (area is null)
        {
            return TypedResults.Ok<IReadOnlyList<SettlementSummary>>([]);
        }

        var user = httpContext.User;
        var idClaim = user.Identity?.IsAuthenticated == true
            ? user.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;
        var callerUserId = Guid.TryParse(idClaim, out var parsedUserId) ? parsedUserId : (Guid?)null;

        var entities = await settlements.GetForWorldAsync(worldId, cancellationToken);

        IReadOnlyList<SettlementSummary> response =
        [
            .. entities
                .Where(s => s.OwnerId == realm.OwnerId
                    || (callerUserId is not null && s.UserId == callerUserId)
                    || area.Hexes.Contains(new HexCoord(s.CentreQ, s.CentreR)))
                .Select(s => new SettlementSummary(
                    s.Id, s.Name, s.OwnerName, s.CentreQ, s.CentreR,
                    s.Buildings.FirstOrDefault(b => b.Type == BuildingType.Longhouse)?.Level ?? 0,
                    s.IslandId)),
        ];

        return TypedResults.Ok(response);
    }

    private static async Task<Results<Accepted<BuildOrderResponse>, NotFound,
        Conflict<ProblemDetails>, BadRequest<ProblemDetails>>> QueueBuild(
        Guid settlementId,
        QueueBuildRequest request,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseBuilding(request.Building, out var type))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown building.",
                Detail = $"'{request.Building}' is not a building. "
                    + $"Valid: {string.Join(", ", BuildingCatalogue.AllTypes.Select(t => t.ToWireName()))}.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await settlements.QueueBuildAsync(
            settlementId, type, new HexCoord(request.Q, request.R), cancellationToken);

        if (result.WorldPaused)
        {
            return TypedResults.Conflict(WorldPausedProblem());
        }

        if (result.Accepted)
        {
            var order = result.Order!;
            var definition = BuildingCatalogue.Get(order.Type, order.TargetLevel);
            var totalSeconds = order.IsWaiting
                ? order.BaseDuration.TotalSeconds
                : (order.CompletesAt!.Value - order.StartedAt!.Value).TotalSeconds;

            return TypedResults.Accepted(
                $"/api/v1/settlements/{settlementId}",
                new BuildOrderResponse(
                    order.Id, order.Coord.Q, order.Coord.R, order.Type.ToWireName(),
                    order.TargetLevel,
                    order.IsWaiting ? "waiting" : "building",
                    definition.SlotCost,
                    order.CompletesAt,
                    order.IsWaiting ? null : totalSeconds,
                    totalSeconds));
        }

        var problem = new ProblemDetails
        {
            Title = "The build was refused.",
            Detail = Describe(result.Rejection, result.MissingPrerequisite),
            Status = StatusCodes.Status409Conflict,
        };
        // Machine-readable, same pattern as founding's Problem(...) — the
        // frontend needs to tell NoFreeSlot (premium upsell) apart from
        // AlreadyQueuedOnHex/QueueFull without parsing Detail text.
        problem.Extensions["rejection"] = result.Rejection.ToString();
        if (result.MissingPrerequisite is { } missing)
        {
            // Same reasoning: a client that wants to link to (or highlight) the
            // building that is missing shouldn't have to parse Detail's prose.
            problem.Extensions["requiredBuilding"] = missing.Type.ToWireName();
            problem.Extensions["requiredLevel"] = missing.Level;
        }

        return result.Rejection == BuildRejection.UnknownBuildingLevel
            ? TypedResults.NotFound()
            : TypedResults.Conflict(problem);
    }

    private static async Task<Results<NoContent, NotFound, Conflict<ProblemDetails>>> CancelBuild(
        Guid settlementId,
        Guid orderId,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        var result = await settlements.CancelBuildAsync(settlementId, orderId, cancellationToken);

        if (result.WorldPaused)
        {
            return TypedResults.Conflict(WorldPausedProblem());
        }

        // OrderNotFound is CancelBuildRejection's only other value — either
        // the order was never there, or it already completed and left the
        // queue (SettleTo ran first — see CancelBuildAsync).
        return result.Accepted ? TypedResults.NoContent() : TypedResults.NotFound();
    }

    private static async Task<Results<Accepted<TrainingOrderResponse>, NotFound,
        Conflict<ProblemDetails>, BadRequest<ProblemDetails>>> TrainUnits(
        Guid settlementId,
        TrainUnitsRequest request,
        SettlementService settlements,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseUnit(request.Unit, out var type))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown unit.",
                Detail = $"'{request.Unit}' is not a unit. "
                    + $"Valid: {string.Join(", ", UnitCatalogue.AllTypes.Select(t => t.ToWireName()))}.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var result = await settlements.TrainUnitsAsync(settlementId, type, request.Count, cancellationToken);

        if (result.WorldPaused)
        {
            return TypedResults.Conflict(WorldPausedProblem());
        }

        if (result.Accepted)
        {
            var order = result.Order!;
            return TypedResults.Accepted(
                $"/api/v1/settlements/{settlementId}",
                new TrainingOrderResponse(
                    order.Id, order.UnitType.ToWireName(), order.Count, 0,
                    order.CompletesAt, (order.CompletesAt - order.StartedAt).TotalSeconds,
                    (order.CompletesAt - order.StartedAt).TotalSeconds));
        }

        var problem = new ProblemDetails
        {
            Title = "The training request was refused.",
            Detail = DescribeTrain(result.Rejection),
            Status = StatusCodes.Status409Conflict,
        };
        problem.Extensions["rejection"] = result.Rejection.ToString();

        return TypedResults.Conflict(problem);
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, Conflict<ProblemDetails>>> SlotRune(
        Guid settlementId,
        Guid runeId,
        SlotRuneRequest request,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var result = await settlements.SlotRuneAsync(
            settlementId, runeId, new HexCoord(request.Q, request.R), cancellationToken);

        return RuneResultToResponse(result, time);
    }

    private static async Task<Results<Ok<SettlementResponse>, NotFound, Conflict<ProblemDetails>>> UnslotRune(
        Guid settlementId,
        Guid runeId,
        SettlementService settlements,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var result = await settlements.UnslotRuneAsync(settlementId, runeId, cancellationToken);

        return RuneResultToResponse(result, time);
    }

    private static Results<Ok<SettlementResponse>, NotFound, Conflict<ProblemDetails>> RuneResultToResponse(
        RuneResult result, TimeProvider time)
    {
        if (result.Outcome == RuneOutcome.SettlementNotFound)
        {
            return TypedResults.NotFound();
        }

        if (!result.Accepted)
        {
            return TypedResults.Conflict(new ProblemDetails
            {
                Title = "The rune action was refused.",
                Detail = DescribeRune(result.Outcome),
                Status = StatusCodes.Status409Conflict,
            });
        }

        var clock = result.Clock!.Value;
        return TypedResults.Ok(
            SettlementResponse.From(result.Settlement!, clock, clock.ToGameTime(time.GetUtcNow())));
    }

    private static string DescribeRune(RuneOutcome outcome) => outcome switch
    {
        RuneOutcome.RuneNotFound => "This settlement holds no such rune.",
        RuneOutcome.RuneAlreadySlotted => "That rune is already slotted; unslot it first.",
        RuneOutcome.RuneNotSlotted => "That rune is not slotted.",
        RuneOutcome.NoShrineOnHex => "No shrine stands on that hex.",
        RuneOutcome.ShrineSlotsFull => "That shrine has no free rune slots.",
        _ => "The rune action was refused.",
    };

    private static Ok<IReadOnlyList<BuildingDefinitionResponse>> Catalogue(int? level)
    {
        var levels = level is { } requested
            ? [requested]
            : Enumerable.Range(1, BuildingCatalogue.MaxLevel).ToArray();

        IReadOnlyList<BuildingDefinitionResponse> response =
        [
            .. from type in BuildingCatalogue.AllTypes
               from l in levels
               let definition = BuildingCatalogue.TryGet(type, l)
               where definition is not null
               select BuildingDefinitionResponse.From(definition),
        ];

        return TypedResults.Ok(response);
    }

    private static Ok<IReadOnlyList<UnitDefinitionResponse>> UnitsCatalogue()
    {
        IReadOnlyList<UnitDefinitionResponse> response =
        [
            .. UnitCatalogue.AllTypes.Select(t => UnitDefinitionResponse.From(UnitCatalogue.Get(t))),
        ];

        return TypedResults.Ok(response);
    }

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

    /// <summary>
    /// <see cref="Get"/>'s 404 when no settlement exists by that id — unlike
    /// a bare 404, this lets the client tell "your stored settlement is
    /// gone for good" apart from a transient failure and drop the stale id
    /// instead of retrying it forever (e.g. after its world got reseeded
    /// out from under it) — see `stores/world.ts`'s
    /// `recoverFromMissingSettlement`.
    /// </summary>
    private static ProblemDetails SettlementNotFoundProblem()
    {
        var problem = new ProblemDetails
        {
            Title = "No such settlement.",
            Detail = "This settlement does not exist, or no longer does.",
            Status = StatusCodes.Status404NotFound,
        };
        problem.Extensions["error"] = "settlement_not_found";
        return problem;
    }

    /// <summary>
    /// <see cref="GetView"/>'s 403 when <see cref="CallerRealmResolver"/>
    /// resolves neither a JWT realm nor a usable <c>X-Owner-Id</c> header, or
    /// refuses one naming someone else's already-claimed realm — the same
    /// body <see cref="OwnershipGate"/> and <see cref="WorldEndpoints"/>'s
    /// fog-mask/plot-suggestion reads use for the same outcomes.
    /// </summary>
    private static IResult NotOwnerRefusal() =>
        Results.Json(new AuthErrorResponse("not_owner"), statusCode: StatusCodes.Status403Forbidden);

    /// <summary>
    /// <see cref="GetView"/>'s 404 when the settlement's own world stopped
    /// existing between resolving it and reading its explored area — same
    /// machine-readable body as <see cref="WorldEndpoints.WorldNotFoundProblem"/>
    /// (private there, so duplicated rather than shared across files).
    /// </summary>
    private static ProblemDetails WorldNotFoundProblem()
    {
        var problem = new ProblemDetails
        {
            Title = "No such world.",
            Detail = "This world does not exist, or no longer does.",
            Status = StatusCodes.Status404NotFound,
        };
        problem.Extensions["error"] = "world_not_found";
        return problem;
    }

    private static ProblemDetails WorldPausedProblem()
    {
        var problem = new ProblemDetails
        {
            Title = "The world is not accepting commands.",
            Detail = "It is paused, locked or under maintenance.",
            Status = StatusCodes.Status409Conflict,
        };
        problem.Extensions["rejection"] = "WorldPaused";
        return problem;
    }

    private static ProblemDetails Problem(FoundingRejection rejection)
    {
        var problem = new ProblemDetails
        {
            Title = "The settlement could not be founded.",
            Detail = rejection switch
            {
                FoundingRejection.WorldNotFound => "No such world.",
                FoundingRejection.IslandNotFound => "No such island in this world.",
                FoundingRejection.WorldPaused => "The world is not accepting commands.",
                FoundingRejection.NotAStartPosition =>
                    "That hex is not one of the island's start positions.",
                FoundingRejection.PlotTaken => "Someone already founded there.",
                FoundingRejection.TooCloseToNeighbour =>
                    $"Settlements must be at least {SettlementService.MinimumSpacing} hexes apart.",
                FoundingRejection.WorldFull => "The world is full.",
                FoundingRejection.AlreadyFounded =>
                    "You already have a settlement in this world. Ships and carts will let you found another one later.",
                FoundingRejection.WorldNotActive => "This world is not active.",
                FoundingRejection.JoinsClosed => "This world is no longer accepting new players.",
                FoundingRejection.NotStartedYet => "This world has not started yet.",
                FoundingRejection.PlotReserved =>
                    "Another settler is about to found there — pick one of the other highlighted plots.",
                _ => "Refused.",
            },
            Status = StatusCodes.Status409Conflict,
        };

        // All of these rejections share the same 409 status, but the
        // frontend needs to tell them apart: AlreadyFounded means "you have
        // a settlement, go there", while PlotTaken/TooCloseToNeighbour mean
        // "someone beat you to that plot, pick another" — very different
        // reactions to the same HTTP status. Matching on `Detail` text would
        // be fragile, so expose the enum itself.
        problem.Extensions["rejection"] = rejection.ToString();
        return problem;
    }

    private static string Describe(
        BuildRejection rejection,
        BuildingPrerequisite? missingPrerequisite = null) => rejection switch
    {
        // Named when the caller knows which prerequisite failed; the bare
        // sentence stays for anything that reports the rejection without one.
        BuildRejection.RequiredBuildingTooLow when missingPrerequisite is { } missing =>
            $"Needs a {missing.Type.ToWireName()} at level {missing.Level} first.",
        BuildRejection.TerrainNotAllowed => "That building cannot stand on that terrain.",
        BuildRejection.HexNotInSettlement => "That hex is outside the settlement's borders.",
        BuildRejection.HexOccupiedByGiant => "That hex is part of a giant feature and can never be built on.",
        BuildRejection.HexOccupied => "Another building already stands there.",
        BuildRejection.NotEnoughResources =>
            "Not enough resources (some may be reserved for queued construction).",
        BuildRejection.LonghouseTooLow => "The longhouse is not high enough level yet.",
        BuildRejection.QueueFull => $"The waiting queue is full (max {Settlement.MaxWaitingOrders}).",
        BuildRejection.AlreadyQueuedOnHex => "That hex is already at its construction-order limit.",
        BuildRejection.MaxLevelReached => "That building is already at its maximum level.",
        BuildRejection.LevelSkipped => "Levels must be built in order.",
        BuildRejection.LonghousePlacementNotAllowed =>
            "A settlement gets its longhouse from founding, not from the build queue.",
        BuildRejection.RequiredBuildingTooLow => "A required building is not high enough level yet.",
        BuildRejection.NoFreeSlot =>
            "Every construction slot is busy. Premium settlements can queue extra builds to wait for a free slot.",
        _ => "Refused.",
    };

    private static string DescribeTrain(TrainRejection rejection) => rejection switch
    {
        TrainRejection.UnitNotAvailable => "That unit is not available at this longhouse level yet.",
        TrainRejection.TrainingQueueFull =>
            $"The training queue is full (max {Settlement.MaxTrainingQueueLength}).",
        TrainRejection.NotEnoughResources =>
            "Not enough resources (some may be reserved for queued construction).",
        TrainRejection.InvalidCount => "Count must be at least 1.",
        TrainRejection.SettlementNotCoastal => "Ships can only be trained at a settlement that claims a shoreline hex.",
        _ => "Refused.",
    };
}
