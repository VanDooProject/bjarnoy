using System.Security.Claims;
using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Settlers;
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
            .WithTags("Armies")
            .WithApiKeyFeature(ApiKeyFeature.Armies);

        settlements.MapPost("/{settlementId:guid}/armies", Dispatch)
            .WithName("DispatchArmy")
            .RequireRateLimiting(RoutePlanningRateLimitOptions.PolicyName)
            .WithSummary("Dispatches units from a settlement's garrison on a move mission.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>()
            .WithConcurrencyRetry();

        settlements.MapGet("/{settlementId:guid}/armies", ListForSettlement)
            .WithName("ListSettlementArmies")
            .WithSummary("Lists the armies belonging to a settlement — home, in transit, or currently supporting elsewhere.")
            // Owner-only: unit composition, mission and destination of a
            // settlement's own dispatched armies are exactly the kind of
            // per-player state a rival must not be able to enumerate.
            .RequireSettlementOwner();

        settlements.MapGet("/{settlementId:guid}/guests", ListGuestArmies)
            .WithName("ListGuestArmies")
            .WithSummary("Lists guest (support) armies currently stationed at a settlement — the host's view; counts only.")
            // Product decision: the host settlement's owner sees every guest
            // stationed here; a guest army's own owner sees only their own
            // guest army/armies at this settlement; anyone else is refused
            // (403) rather than shown an empty list — see ListGuestArmies's
            // own comment for why this can't be the plain
            // SettlementOwnershipEndpointFilter (it would also refuse a
            // legitimate guest-owner caller).
            .RequireHostOrGuestOwner();

        settlements.MapPost("/{settlementId:guid}/guests/{armyId:guid}/send-home", SendGuestHome)
            .WithName("SendGuestArmyHome")
            .RequireRateLimiting(RoutePlanningRateLimitOptions.PolicyName)
            .WithSummary("Sends a guest (support) army stationed at this settlement back home — the host's recall.")
            // Host owner only: the guest's own owner recalls through
            // RecallArmy. 204 with no body, since the guest's full
            // ArmyResponse (route, provisions) is owner-only.
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireSettlementOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>()
            .WithConcurrencyRetry();

        var armies = app.MapGroup("/api/v1/armies")
            .WithApiVersionSet(versionSet)
            .WithTags("Armies")
            .WithApiKeyFeature(ApiKeyFeature.Armies);

        armies.MapGet("/{armyId:guid}", Get)
            .WithName("GetArmy")
            .WithSummary("Fetches an army as of now, including its current position and route.")
            // Owner (of the army's home settlement) only — full unit
            // composition, provisions and route. The frontend only ever
            // calls this for armies from the caller's own
            // ListSettlementArmies (stores/world.ts refreshArmies); nothing
            // reads a hostile army's detail by id today, so there is no
            // fog-gated minimal view to build here.
            .RequireArmyOwner()
            .WithConcurrencyRetry();

        armies.MapPost("/{armyId:guid}/recall", Recall)
            .WithName("RecallArmy")
            .RequireRateLimiting(RoutePlanningRateLimitOptions.PolicyName)
            .WithSummary("Turns an army around mid-journey to head home early.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireArmyOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>()
            .WithConcurrencyRetry();

        armies.MapPost("/{armyId:guid}/orders", FieldOrder)
            .WithName("FieldOrderArmy")
            .RequireRateLimiting(RoutePlanningRateLimitOptions.PolicyName)
            .WithSummary("Sends an army already out in the field onward on a move, attack, support, hunt or raid (issue #156) — 'move on' if it's standing, 'append goal' if it's still travelling. A standing army can send only part of itself; the response is the army that left.")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireArmyOwner()
            .AddEndpointFilter<UserActivityEndpointFilter>()
            .WithConcurrencyRetry();

        armies.MapPost("/{armyId:guid}/retarget-founding", RetargetFounding)
            .WithName("RetargetFoundingConvoy")
            .RequireRateLimiting(RoutePlanningRateLimitOptions.PolicyName)
            .WithSummary("Redirects an in-transit or parked founding convoy to a different target hex (issue #55).")
            .AddEndpointFilter<ActiveUserEndpointFilter>()
            .RequireArmyOwner()
            .WithConcurrencyRetry();

        var reports = app.MapGroup("/api/v1")
            .WithApiVersionSet(versionSet)
            .WithTags("Battle reports")
            .WithApiKeyFeature(ApiKeyFeature.Armies);

        reports.MapGet("/reports/{reportId:guid}", GetReport)
            .WithName("GetBattleReport")
            .WithSummary("Fetches one battle report by id.")
            // Either party's settlement owner — see ReportOwnershipEndpointFilter.
            .RequireReportParty();

        reports.MapGet("/worlds/{worldId:guid}/reports", ListReportsForOwner)
            .WithName("ListBattleReports")
            .WithSummary("Lists the caller's battle reports in a world, as attacker or defender, newest first — one inbox across all their settlements.")
            .RequireCallerRealm();

        reports.MapGet("/field-reports/{reportId:guid}", GetFieldReport)
            .WithName("GetFieldBattleReport")
            .WithSummary("Fetches one in-flight field battle report by id (issue #206).")
            .RequireFieldReportParty();

        reports.MapGet("/worlds/{worldId:guid}/field-reports", ListFieldReportsForOwner)
            .WithName("ListFieldBattleReports")
            .WithSummary("Lists the caller's field battle reports in a world, either side, newest first (issue #206).")
            .RequireCallerRealm();

        reports.MapGet("/camp-reports/{reportId:guid}", GetCampReport)
            .WithName("GetCampReport")
            .WithSummary("Fetches one wildlife camp report (hunt, ambush or tower) by id.")
            // Only the player the report belongs to — a camp has no owner.
            .RequireCampReportOwner();

        reports.MapGet("/worlds/{worldId:guid}/camp-reports", ListCampReportsForOwner)
            .WithName("ListCampReports")
            .WithSummary("Lists the caller's wildlife camp reports in a world, newest first.")
            .RequireCallerRealm();

        reports.MapGet("/army-reports/{reportId:guid}", GetArmyReport)
            .WithName("GetArmyReport")
            .WithSummary("Fetches one army report (army stuck, army starved) by id.")
            // Only the player the report belongs to.
            .RequireArmyReportOwner();

        reports.MapGet("/worlds/{worldId:guid}/army-reports", ListArmyReportsForPlayer)
            .WithName("ListWorldArmyReports")
            .WithSummary("Lists the caller's own army reports in a world, newest first.")
            .RequireCallerRealm();

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

        // Group by spot (the same spot listed twice merges), parsing units and dropping all-zero entries.
        var bySpot = new List<(HexCoord Spot, List<UnitStack> Stacks)>();
        foreach (var group in request.From)
        {
            var spot = group.Spot.ToHexCoord();
            var stacks = new List<UnitStack>();
            foreach (var unit in group.Units)
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

                if (unit.Count > 0)
                {
                    stacks.Add(new UnitStack(type, unit.Count));
                }
            }

            if (stacks.Count == 0)
            {
                continue;
            }

            var existing = bySpot.FindIndex(e => e.Spot == spot);
            if (existing >= 0)
            {
                bySpot[existing].Stacks.AddRange(stacks);
            }
            else
            {
                bySpot.Add((spot, stacks));
            }
        }

        if (bySpot.Count == 0)
        {
            return TypedResults.Conflict(Problem(DispatchRejection.NoUnitsRequested));
        }

        if (!TryParseMission(request.Mission, out var mission))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown mission.",
                Detail = $"'{request.Mission}' is not a mission. Valid: move, attack, support, raid, found, hunt, setupcamp.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var waypoints = (request.Waypoints ?? []).Select(w => w.ToHexCoord()).ToList();
        var destination = request.Destination?.ToHexCoord();

        var result = await armies.DispatchAsync(
            settlementId, [.. bySpot.Select(g => (g.Spot, (IReadOnlyList<UnitStack>)g.Stacks))], waypoints, destination, request.Provisions,
            mission, request.TargetSettlementId, request.TargetBuildingCoord?.ToHexCoord(), cancellationToken);

        if (result.WorldPaused)
        {
            var worldPausedProblem = new ProblemDetails
            {
                Title = "The world is not accepting commands.",
                Detail = "It is paused, locked or under maintenance.",
                Status = StatusCodes.Status409Conflict,
            };
            worldPausedProblem.Extensions["rejection"] = "WorldPaused";
            return TypedResults.Conflict(worldPausedProblem);
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

    /// <summary>
    /// Host-or-guest gated in-handler (see the mapping's own comment): the
    /// host settlement's owner gets every guest; a guest army's own owner
    /// gets only the subset of guest entries whose home settlement they
    /// own; anyone else — including a caller who owns neither the host nor
    /// any listed guest — is refused with the ordinary 403 <c>not_owner</c>
    /// body, not an (indistinguishable-from-"no guests") empty 200.
    /// </summary>
    private static async Task<IResult> ListGuestArmies(
        Guid settlementId,
        HttpContext httpContext,
        ArmyService armies,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var hostOwnership = await realms.GetOwnershipAsync(settlementId, cancellationToken);
        if (hostOwnership is null)
        {
            // No such settlement — nothing to prove ownership of; answer as
            // if it simply has no guests, same as before this endpoint was
            // gated, rather than pre-empting the (nonexistent) NotFound case
            // with a 403.
            return TypedResults.Ok<IReadOnlyList<GuestArmySummary>>([]);
        }

        var (hostUserId, hostOwnerId, _) = hostOwnership.Value;
        var entities = await armies.GetGuestArmiesAsync(settlementId, cancellationToken);

        if (OwnershipGate.Owns(httpContext, hostUserId, hostOwnerId))
        {
            IReadOnlyList<GuestArmySummary> all = [.. entities.Select(GuestArmySummary.From)];
            return TypedResults.Ok(all);
        }

        var own = new List<GuestArmySummary>();
        foreach (var entity in entities)
        {
            var guestOwnership = await realms.GetOwnershipAsync(entity.SettlementId, cancellationToken);
            if (guestOwnership is { } ownership && OwnershipGate.Owns(httpContext, ownership.UserId, ownership.OwnerId))
            {
                own.Add(GuestArmySummary.From(entity));
            }
        }

        if (own.Count > 0)
        {
            IReadOnlyList<GuestArmySummary> response = own;
            return TypedResults.Ok(response);
        }

        return Results.Json(new AuthErrorResponse("not_owner"), statusCode: StatusCodes.Status403Forbidden);
    }

    /// <summary>
    /// True when a refused recall means "no such army to recall" (404) —
    /// unknown, not a guest there, or arrived home during this very settle.
    /// Shared by <see cref="Recall"/> and <see cref="SendGuestHome"/>.
    /// </summary>
    private static bool RecallMissing(RecallResult result) =>
        result.Outcome == RecallOutcome.ArmyNotFound
        || (result.Outcome == RecallOutcome.NothingToRecall && result.Army is null);

    /// <summary>
    /// The 409 body for a recall that was understood but cannot happen, or
    /// null when it did not conflict — the one place the texts are written,
    /// for <see cref="Recall"/> and <see cref="SendGuestHome"/>. Carries the
    /// outcome as the <c>rejection</c> code the frontend translates.
    /// </summary>
    private static ProblemDetails? RecallConflict(RecallResult result) => result.Outcome switch
    {
        RecallOutcome.NothingToRecall => new ProblemDetails
        {
            Title = "Nothing to recall.",
            Detail = "The army is already heading home.",
            Status = StatusCodes.Status409Conflict,
            Extensions = { ["rejection"] = nameof(RecallOutcome.NothingToRecall) },
        },
        RecallOutcome.NoRouteHome => new ProblemDetails
        {
            Title = "No route home.",
            Detail = "The army cannot be recalled: no route home exists from where it currently is.",
            Status = StatusCodes.Status409Conflict,
            Extensions = { ["rejection"] = nameof(RecallOutcome.NoRouteHome) },
        },
        _ => null,
    };

    private static async Task<Results<NoContent, NotFound, Conflict<ProblemDetails>>> SendGuestHome(
        Guid settlementId,
        Guid armyId,
        ArmyService armies,
        CancellationToken cancellationToken)
    {
        var result = await armies.SendGuestHomeAsync(settlementId, armyId, cancellationToken);

        if (RecallMissing(result))
        {
            return TypedResults.NotFound();
        }

        return RecallConflict(result) is { } conflict ? TypedResults.Conflict(conflict) : TypedResults.NoContent();
    }

    private static async Task<Results<Ok<ArmyResponse>, NotFound, Conflict<ProblemDetails>>> Recall(
        Guid armyId,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var result = await armies.RecallAsync(armyId, cancellationToken);

        if (RecallMissing(result))
        {
            return TypedResults.NotFound();
        }

        if (RecallConflict(result) is { } conflict)
        {
            return TypedResults.Conflict(conflict);
        }

        var found = await armies.GetAsync(armyId, cancellationToken);
        var (entity, clock) = found!.Value;

        // An army recalled while it stands on its home spot (a group of a gathering that stands on its own spot) is home again at
        // once and folded into the garrison by the read above: the answer is the army as it was recalled.
        return TypedResults.Ok(ArmyResponse.From(entity ?? result.Army!, clock.ToGameTime(time.GetUtcNow())));
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
                RetargetFoundingRejection.TargetNotReachable => NoLandRoute,
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

    private static async Task<Results<Ok<ArmyResponse>, NotFound, BadRequest<ProblemDetails>, Conflict<ProblemDetails>>> FieldOrder(
        Guid armyId,
        FieldOrderRequest request,
        ClaimsPrincipal principal,
        ArmyService armies,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseMission(request.Mission, out var mission))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown mission.",
                Detail = $"'{request.Mission}' is not a mission. Valid: move, attack, support, raid, hunt.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        List<UnitStack>? unitStacks = null;
        if (request.Units is not null)
        {
            unitStacks = [];
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
        }

        var waypoints = (request.Waypoints ?? []).Select(w => w.ToHexCoord()).ToList();
        var destination = request.Destination?.ToHexCoord();

        // Anonymous play is a real, ordinary caller here (same as every other
        // army endpoint) — GetIsPremiumAsync has nothing to check for one, so
        // ArmyService.FieldOrderAsync just treats a null id as never premium.
        var idClaim = principal.Identity?.IsAuthenticated == true
            ? principal.FindFirstValue(ClaimTypes.NameIdentifier)
            : null;
        Guid? callerUserId = Guid.TryParse(idClaim, out var parsed) ? parsed : null;

        var result = await armies.FieldOrderAsync(
            armyId, waypoints, destination, callerUserId, mission, request.TargetSettlementId,
            request.TargetBuildingCoord?.ToHexCoord(), unitStacks, cancellationToken);

        if (result.ArmyNotFound)
        {
            return TypedResults.NotFound();
        }

        if (!result.Accepted)
        {
            return TypedResults.Conflict(FieldOrderProblem(result.Rejection));
        }

        // The army that left: the new army when only part of a standing one was sent.
        var found = await armies.GetAsync(result.Army!.Id, cancellationToken);
        var (entity, clock) = found!.Value;
        return TypedResults.Ok(ArmyResponse.From(entity!, clock.ToGameTime(time.GetUtcNow())));
    }

    /// <summary>Why a land army has no route: mountains and wide rivers stop it (streams and open land do not).</summary>
    private const string NoLandRoute = "No land route: mountains and wide rivers can't be crossed.";

    /// <summary>Why a fleet has no route: the water it sails is cut off from the target.</summary>
    private const string NoSeaRoute = "No sea route: the ships can't reach that by water.";

    /// <summary>The route search gave up: the trip is too long to plan, so a shorter one has to be picked.</summary>
    private const string RouteTooLong = "That trip is too long to plan. Choose a closer destination.";

    private static ProblemDetails FieldOrderProblem(FieldOrderRejection rejection)
    {
        var problem = new ProblemDetails
        {
            Title = "The field order was refused.",
            Detail = rejection switch
            {
                FieldOrderRejection.NoActiveJourney =>
                    "This army has nowhere to extend from — it's at home, supporting, already heading home, or arrived home during this settle.",
                FieldOrderRejection.MissionNotFieldOrderable =>
                    "Only an army on a move (or a founding convoy standing at its target) can take a field order; one that is attacking, hunting, supporting or raiding has to finish that or be recalled.",
                FieldOrderRejection.MissionNotAllowed =>
                    "A field order can be a move, attack, support, hunt or raid; a founding convoy is redirected with its own retarget.",
                FieldOrderRejection.DestinationRequired => "A move or hunt order requires a destination.",
                FieldOrderRejection.TargetSettlementRequired => "This mission requires a target settlement.",
                FieldOrderRejection.TargetSettlementNotFound => "The target settlement does not exist.",
                FieldOrderRejection.CannotAttackOwnSettlement => "An army cannot attack its own settlement.",
                FieldOrderRejection.CannotSupportOwnSettlement => "An army cannot support its own settlement.",
                FieldOrderRejection.NoCampAtDestination => "No wildlife camp stands on the destination hex.",
                FieldOrderRejection.HuntRequiresLandUnits => "A fleet needs land troops aboard to hunt a camp on land.",
                FieldOrderRejection.HuntRequiresFleet => "Only ships can hunt a camp at sea (the whale road); land units cannot reach it.",
                FieldOrderRejection.TargetBuildingRequiresAttackMission =>
                    "A target building may only be given for an attack, raid or support mission.",
                FieldOrderRejection.FleetTargetBuildingRequired =>
                    "A fleet must be sent at one building on the target settlement's shore.",
                FieldOrderRejection.FleetTargetBuildingNotOnShore =>
                    "That building is not on the target settlement's shore, so a fleet cannot reach it.",
                FieldOrderRejection.SupportSpotRequired => "A support order must name a garrison spot of the target to join.",
                FieldOrderRejection.SupportSpotCannotHold => "That hex is not a garrison spot of the target that can hold every unit of the army.",
                FieldOrderRejection.InsufficientShipCapacity =>
                    "The ships would not have enough slots for the troops aboard (for a split, each part needs ships for its own troops).",
                FieldOrderRejection.SplitRequiresStandingArmy =>
                    "Only an army standing at its destination can send part of itself; one still marching moves as a whole.",
                FieldOrderRejection.InvalidUnitSelection =>
                    "The chosen units must be at least one unit, of types and numbers the army actually has.",
                FieldOrderRejection.DestinationNotLand => "The destination is not land; sea pathing is not supported yet.",
                FieldOrderRejection.DestinationNotSea => "The destination is not sea; fleets can only path over water.",
                FieldOrderRejection.WaypointNotLand => "A waypoint is not land; sea pathing is not supported yet.",
                FieldOrderRejection.WaypointNotSea => "A waypoint is not sea; fleets can only path over water.",
                FieldOrderRejection.UnreachableLeg => NoLandRoute,
                FieldOrderRejection.NoSeaRoute => NoSeaRoute,
                FieldOrderRejection.RouteTooLong => RouteTooLong,
                FieldOrderRejection.InsufficientProvisionsForRoundTrip =>
                    "The provisions remaining (for a split, the share that goes with the leaving units) would not cover the round trip to the new destination.",
                FieldOrderRejection.PremiumRequired =>
                    "Waypoints on a field order, and continuing a march already under way, require a premium account.",
                _ => "Refused.",
            },
            Status = StatusCodes.Status409Conflict,
        };

        problem.Extensions["rejection"] = rejection.ToString();
        return problem;
    }

    private static async Task<Results<Ok<BattleReportResponse>, NotFound>> GetReport(
        Guid reportId,
        HttpContext httpContext,
        BattleReportService reports,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetAsync(reportId, cancellationToken);
        if (report is null) return TypedResults.NotFound();

        var viewer = await ReportInbox.ViewerOwnerIdAsync(httpContext, report.WorldId, realms, cancellationToken);
        return TypedResults.Ok(BattleReportResponse.From(report, viewer));
    }

    private static async Task<Results<Ok<IReadOnlyList<BattleReportResponse>>, BadRequest<ProblemDetails>, JsonHttpResult<AuthErrorResponse>>> ListReportsForOwner(
        Guid worldId,
        HttpContext httpContext,
        BattleReportService reports,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader) return ReportInbox.MissingOwnerId();
        if (realm.Outcome == CallerRealmOutcome.Refused) return ReportInbox.NotOwner();

        var entities = await reports.GetForOwnerAsync(worldId, realm.OwnerId!, cancellationToken);
        IReadOnlyList<BattleReportResponse> response = [.. entities.Select(e => BattleReportResponse.From(e, realm.OwnerId))];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<FieldBattleReportResponse>, NotFound>> GetFieldReport(
        Guid reportId,
        HttpContext httpContext,
        FieldBattleReportService reports,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetAsync(reportId, cancellationToken);
        if (report is null) return TypedResults.NotFound();

        var names = await reports.GetSideNamesAsync([report], cancellationToken);
        var viewer = await ReportInbox.ViewerOwnerIdAsync(httpContext, report.WorldId, realms, cancellationToken);
        return TypedResults.Ok(FieldBattleReportResponse.From(report, names, viewer));
    }

    private static async Task<Results<Ok<IReadOnlyList<FieldBattleReportResponse>>, BadRequest<ProblemDetails>, JsonHttpResult<AuthErrorResponse>>> ListFieldReportsForOwner(
        Guid worldId,
        HttpContext httpContext,
        FieldBattleReportService reports,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader) return ReportInbox.MissingOwnerId();
        if (realm.Outcome == CallerRealmOutcome.Refused) return ReportInbox.NotOwner();

        var entities = await reports.GetForOwnerAsync(worldId, realm.OwnerId!, cancellationToken);
        var names = await reports.GetSideNamesAsync(entities, cancellationToken);
        IReadOnlyList<FieldBattleReportResponse> response = [.. entities.Select(e => FieldBattleReportResponse.From(e, names, realm.OwnerId))];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<CampReportResponse>, NotFound>> GetCampReport(
        Guid reportId,
        CampReportService reports,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetAsync(reportId, cancellationToken);
        return report is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(CampReportResponse.From(report));
    }

    private static async Task<Results<Ok<IReadOnlyList<CampReportResponse>>, BadRequest<ProblemDetails>, JsonHttpResult<AuthErrorResponse>>> ListCampReportsForOwner(
        Guid worldId,
        HttpContext httpContext,
        CampReportService reports,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome == CallerRealmOutcome.MissingHeader) return ReportInbox.MissingOwnerId();
        if (realm.Outcome == CallerRealmOutcome.Refused) return ReportInbox.NotOwner();

        var entities = await reports.GetForOwnerAsync(worldId, realm.OwnerId!, cancellationToken);
        IReadOnlyList<CampReportResponse> response = [.. entities.Select(CampReportResponse.From)];
        return TypedResults.Ok(response);
    }

    private static async Task<Results<Ok<ArmyReportResponse>, NotFound>> GetArmyReport(
        Guid reportId,
        ArmyReportService reports,
        CancellationToken cancellationToken)
    {
        var report = await reports.GetAsync(reportId, cancellationToken);
        return report is null
            ? TypedResults.NotFound()
            : TypedResults.Ok(ArmyReportResponse.From(report));
    }

    private static async Task<Ok<IReadOnlyList<ArmyReportResponse>>> ListArmyReportsForPlayer(
        Guid worldId,
        HttpContext httpContext,
        ArmyReportService reports,
        RealmDirectory realms,
        CancellationToken cancellationToken)
    {
        var realm = await CallerRealmResolver.ResolveAsync(httpContext, worldId, realms, cancellationToken);
        if (realm.Outcome != CallerRealmOutcome.Resolved)
        {
            return TypedResults.Ok<IReadOnlyList<ArmyReportResponse>>([]);
        }

        var entities = await reports.GetForPlayerAsync(worldId, realm.OwnerId!, cancellationToken);
        IReadOnlyList<ArmyReportResponse> response = [.. entities.Select(ArmyReportResponse.From)];
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

        if (string.Equals(value, "hunt", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.Hunt;
            return true;
        }

        if (string.Equals(value, "setupcamp", StringComparison.OrdinalIgnoreCase))
        {
            mission = ArmyMission.SetUpCamp;
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
                DispatchRejection.InsufficientGarrison => "The garrison spot does not hold that many of one or more requested unit types.",
                DispatchRejection.NotAGarrisonSpot => "The hex is not a garrison spot (longhouse, tower or dock) of the settlement.",
                DispatchRejection.SupportSpotRequired => "A support mission must name a garrison spot of the target to join.",
                DispatchRejection.SupportSpotCannotHold => "That hex is not a garrison spot of the target that can hold every unit of the army.",
                DispatchRejection.ProvisionsExceedCarryCapacity => "The requested provisions exceed what these units can carry.",
                DispatchRejection.InsufficientResources => "Not enough food to load the requested provisions (some may be reserved for queued construction).",
                DispatchRejection.DestinationNotLand => "The destination is not land; sea pathing is not supported yet.",
                DispatchRejection.WaypointNotLand => "A waypoint is not land; sea pathing is not supported yet.",
                DispatchRejection.UnreachableLeg => NoLandRoute,
                DispatchRejection.NoSeaRoute => NoSeaRoute,
                DispatchRejection.RouteTooLong => RouteTooLong,
                DispatchRejection.InsufficientProvisionsForRoundTrip =>
                    "The loaded provisions would not cover the full round trip's upkeep.",
                DispatchRejection.TargetSettlementRequired => "This mission requires a target settlement.",
                DispatchRejection.TargetSettlementNotFound => "The target settlement does not exist.",
                DispatchRejection.CannotAttackOwnSettlement => "An army cannot attack its own settlement.",
                DispatchRejection.CannotSupportOwnSettlement => "An army cannot support its own settlement.",
                DispatchRejection.DestinationRequired => "A move mission requires a destination.",
                DispatchRejection.TargetBuildingRequiresAttackMission =>
                    "A target building may only be given for an attack mission.",
                DispatchRejection.DestinationNotSea => "The destination is not sea; fleets can only path over water.",
                DispatchRejection.WaypointNotSea => "A waypoint is not sea; fleets can only path over water.",
                DispatchRejection.FleetTargetBuildingRequired =>
                    "A fleet must be sent at one building on the target settlement's shore.",
                DispatchRejection.FleetTargetBuildingNotOnShore =>
                    "That building is not on the target settlement's shore, so a fleet cannot reach it.",
                DispatchRejection.WrongSettlerCount =>
                    $"A founding mission requires exactly {Founding.RequiredSettlers} settlers, no more, no fewer.",
                DispatchRejection.InsufficientShipCapacity =>
                    "The ships in this fleet do not have enough slots for the troops aboard.",
                DispatchRejection.RenownOrSettlementSlotRequirementNotMet =>
                    "Not enough renown for another settlement yet, or founding requires a real account.",
                DispatchRejection.TargetHexNotFoundable =>
                    "The target hex is too close to an already-claimed settlement's border.",
                DispatchRejection.NoCampAtDestination => "No wildlife camp stands on the destination hex.",
                DispatchRejection.HuntRequiresLandUnits => "A fleet needs land troops aboard to hunt a camp on land.",
                DispatchRejection.HuntRequiresFleet => "Only ships can hunt a camp at sea (the whale road); land units cannot reach it.",
                DispatchRejection.WrongCampBuilderCount =>
                    $"A beach camp mission requires exactly {BeachCamp.RequiredBuilders} camp builders, no more, no fewer.",
                DispatchRejection.CampSiteNotSandShore => "A beach camp can only be set up on a sand hex on the shore.",
                DispatchRejection.CampSiteNotFree =>
                    "That hex is taken: a building, a settlement, a wildlife camp or a giant stands on it.",
                _ => "Refused.",
            },
            Status = StatusCodes.Status409Conflict,
        };

        problem.Extensions["rejection"] = rejection.ToString();
        return problem;
    }
}
