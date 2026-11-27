using Asp.Versioning.Builder;
using Bjarnoy.Api.Auth.ApiKeys;
using Bjarnoy.Api.Auth;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// The premium fight simulator (issue #40 phase 7, design doc §9): calls
/// <see cref="AttackResolver.Resolve"/> (the ship fight and the land fight, and the siege) directly, with no settlement, army, or
/// <c>BattleReportEntity</c> — no database write happens as a side effect of
/// calling this endpoint at all. This is the entire payoff of keeping
/// <c>Bjarnoy.Domain</c> pure since phase 3: a premium user can explore "what
/// if" fights without any of that touching real game state.
/// </summary>
public static class SimulatorEndpoints
{
    /// <summary>
    /// Since the simulator models no real settlement, siege damage (when
    /// applicable) is resolved against this one nominal building rather than
    /// a real defender's layout — enough to exercise
    /// <see cref="SiegeResolver.Resolve"/> and preview its levels-destroyed
    /// math, without inventing a fictitious building list for the caller to
    /// configure. See <see cref="SimulatorResponse.Siege"/>'s remarks.
    /// </summary>
    private static readonly IReadOnlyList<PlacedBuilding> NominalDefenderBuildings =
        [new PlacedBuilding(new HexCoord(0, 0), BuildingType.Longhouse, 1)];

    /// <summary>
    /// The simulator has no real settlement stock to cap loot by, so it
    /// assumes an abundant one — <see cref="SimulatorResponse.LootTaken"/>
    /// then reflects the attacker's full carry capacity split evenly, the
    /// same "abundant" convention <c>BattleResolverTests</c> uses.
    /// </summary>
    private static readonly ResourceAmounts AbundantLoot = ResourceAmounts.Uniform(1_000_000);

    public static IEndpointRouteBuilder MapSimulatorEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapPost("/api/v1/simulator", Simulate)
            .WithApiVersionSet(versionSet)
            .WithTags("Simulator")
            .WithName("SimulateBattle")
            .WithSummary("Premium-only: resolves a hypothetical battle with no persistence.")
            .RequirePremiumUser()
            .WithApiKeyFeature(ApiKeyFeature.Simulator);

        return app;
    }

    private static Results<Ok<SimulatorResponse>, BadRequest<ProblemDetails>> Simulate(SimulatorRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!TryParseStacks(request.AttackerStacks, out var attackerStacks, out var badUnit))
        {
            return TypedResults.BadRequest(UnknownUnitProblem(badUnit!));
        }

        if (!TryParseStacks(request.DefenderStacks ?? [], out var defenderStacks, out badUnit))
        {
            return TypedResults.BadRequest(UnknownUnitProblem(badUnit!));
        }

        if (!TryParseStacks(request.GuestDefenderStacks ?? [], out var guestStacks, out badUnit))
        {
            return TypedResults.BadRequest(UnknownUnitProblem(badUnit!));
        }

        if (!ArmyEndpoints.TryParseMission(request.Mission ?? "attack", out var mission)
            || mission is not (ArmyMission.Attack or ArmyMission.Raid))
        {
            return TypedResults.BadRequest(new ProblemDetails
            {
                Title = "Unknown mission.",
                Detail = $"'{request.Mission}' is not a mission the simulator can fight. Valid: attack, raid.",
                Status = StatusCodes.Status400BadRequest,
            });
        }

        var defenseBonusPercent = BuildingCatalogue.TowerDefenseBonusPercent(request.TowerLevel);
        var seed = request.Seed ?? Random.Shared.Next();
        var raid = mission == ArmyMission.Raid;

        // The one code path a real attack takes: a land army fights the land units, a fleet fights the ships and then lands what is
        // aboard. No provisions to refill, and no named target building (so no fire damage); the siege hits the nominal Longhouse.
        var plan = AttackResolver.Resolve(
            attackerStacks, defenderStacks, guestStacks, defenseBonusPercent, AbundantLoot, seed, raid,
            request.LandAttackBonusPercent, request.ShipAttackBonusPercent,
            targetBuildingCoord: null, NominalDefenderBuildings, _ => Terrain.Grass, provisionsAtBattle: double.PositiveInfinity);

        var report = BattleReport.From(
            Guid.Empty, DateTimeOffset.UnixEpoch, Guid.Empty, Guid.Empty, Guid.Empty, attackerStacks, plan, seed, raid);
        var response = SimulatorResponse.From(report);

        return TypedResults.Ok(response);
    }

    private static bool TryParseStacks(
        IReadOnlyList<UnitCountRequest> requested, out List<UnitStack> stacks, out string? badUnit)
    {
        stacks = [];
        foreach (var unit in requested)
        {
            if (!ArmyEndpoints.TryParseUnit(unit.Unit, out var type))
            {
                badUnit = unit.Unit;
                return false;
            }

            stacks.Add(new UnitStack(type, unit.Count));
        }

        badUnit = null;
        return true;
    }

    private static ProblemDetails UnknownUnitProblem(string badUnit) => new()
    {
        Title = "Unknown unit.",
        Detail = $"'{badUnit}' is not a unit. Valid: {string.Join(", ", UnitCatalogue.AllTypes.Select(t => t.ToWireName()))}.",
        Status = StatusCodes.Status400BadRequest,
    };
}
