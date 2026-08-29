using Asp.Versioning.Builder;
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
/// <see cref="BattleResolver.Resolve"/> (and <see cref="SiegeResolver.Resolve"/>
/// when applicable) directly, with no settlement, army, or
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
            .AddEndpointFilter<PremiumUserEndpointFilter>();

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

        var combinedDefense = defenderStacks
            .Concat(guestStacks)
            .GroupBy(s => s.Type)
            .Select(g => new UnitStack(g.Key, g.Sum(s => s.Count)))
            .ToList();

        var defenseBonusPercent = BuildingCatalogue.TowerDefenseBonusPercent(request.TowerLevel);
        var seed = request.Seed ?? Random.Shared.Next();
        var raid = mission == ArmyMission.Raid;

        var plan = BattleResolver.Resolve(
            attackerStacks, combinedDefense, defenseBonusPercent, AbundantLoot, seed, raid);

        var siege = plan.Winner == BattleWinner.Attacker
            ? SiegeResolver.Resolve(plan.AttackerSurvivors, NominalDefenderBuildings, requestedTargetCoord: null, seed)
            : SiegeOutcome.None;

        var lostByType = plan.AttackerLosses.ToDictionary(s => s.Type, s => s.Count);
        var survivedByType = plan.AttackerSurvivors.ToDictionary(s => s.Type, s => s.Count);
        var attackerLines = attackerStacks
            .Select(sent => new BattleReportAttackerLineResponse(
                sent.Type.ToWireName(), sent.Count,
                lostByType.GetValueOrDefault(sent.Type), survivedByType.GetValueOrDefault(sent.Type)))
            .ToList();

        var defenderSurvivedByType = plan.DefenderSurvivors.ToDictionary(s => s.Type, s => s.Count);
        var defenderLines = plan.DefenderLosses
            .Select(lost => new BattleReportDefenderLineResponse(
                lost.Type.ToWireName(), lost.Count, defenderSurvivedByType.GetValueOrDefault(lost.Type)))
            .Concat(plan.DefenderSurvivors
                .Where(s => !plan.DefenderLosses.Any(l => l.Type == s.Type))
                .Select(s => new BattleReportDefenderLineResponse(s.Type.ToWireName(), Lost: 0, Survived: s.Count)))
            .ToList();

        var response = new SimulatorResponse(
            raid ? "raid" : "attack",
            plan.Winner.ToString().ToLowerInvariant(),
            plan.AttackPower,
            plan.DefensePower,
            seed,
            ResourceAmountsResponse.From(plan.LootTaken),
            attackerLines,
            defenderLines,
            BattleReportSiegeResponse.From(BattleReportSiegeLine.From(siege)));

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
