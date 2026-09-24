using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Trade;
using Bjarnoy.Infrastructure.Entities;
using static Bjarnoy.Infrastructure.Services.AiPlayerService;

namespace Bjarnoy.Api.Contracts;

/// <summary>One settlement the admin AI listing names — just enough to link back into the settlement editor.</summary>
public sealed record AiPlayerSettlementSummary(Guid Id, string Name)
{
    public static AiPlayerSettlementSummary From(SettlementEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);

        return new AiPlayerSettlementSummary(entity.Id, entity.Name);
    }
}

/// <summary>
/// One entry of an AI player's objective list, as shaped for the admin UI —
/// see <see cref="AiObjective"/>.
/// </summary>
/// <param name="Kind">Wire name (see <c>AiObjectiveKindExtensions.ToWireName</c>), e.g. <c>"reachlonghouselevel"</c>.</param>
/// <param name="Building">Wire name of the tracked building, set only for <c>reachbuildinglevel</c>.</param>
/// <param name="Resource">Wire name of the tracked resource, set only for <c>productionrate</c>.</param>
/// <param name="Met">
/// Whether this objective is currently satisfied, kept simple: true if
/// <em>any</em> of this AI's settlements alone satisfies it — see
/// <see cref="AiObjective.IsMet"/>.
/// </param>
public sealed record AiObjectiveResponse(string Kind, string? Building, string? Resource, double Target, bool Met)
{
    public static AiObjectiveResponse From(AiObjective objective, IReadOnlyList<Settlement> settlements)
    {
        ArgumentNullException.ThrowIfNull(objective);
        ArgumentNullException.ThrowIfNull(settlements);

        return new AiObjectiveResponse(
            objective.Kind.ToWireName(),
            objective.Building?.ToWireName(),
            objective.Resource?.ToWireName(),
            objective.Target,
            settlements.Any(objective.IsMet));
    }
}

/// <summary>One AI jarl, as the admin AI-players listing shows it.</summary>
public sealed record AiPlayerAdminResponse(
    Guid UserId,
    string UserName,
    Guid WorldId,
    string Personality,
    IReadOnlyList<AiObjectiveResponse> Objectives,
    DateTimeOffset NextActAt,
    DateTimeOffset CreatedAt,
    Guid? TakenOverSettlementId,
    IReadOnlyList<AiPlayerSettlementSummary> Settlements)
{
    public static AiPlayerAdminResponse From(AiPlayerListItem item)
    {
        ArgumentNullException.ThrowIfNull(item);
        ArgumentNullException.ThrowIfNull(item.AiPlayer.User);

        var settledDomains = item.Settlements.Select(s => s.ToDomain()).ToList();

        return new AiPlayerAdminResponse(
            item.AiPlayer.UserId,
            item.AiPlayer.User.UserName,
            item.AiPlayer.WorldId,
            item.AiPlayer.Personality.ToWireName(),
            [.. item.AiPlayer.Objectives.Select(o => AiObjectiveResponse.From(o, settledDomains))],
            item.AiPlayer.NextActAt,
            item.AiPlayer.CreatedAt,
            item.AiPlayer.TakenOverSettlementId,
            [.. item.Settlements.Select(AiPlayerSettlementSummary.From)]);
    }
}

/// <param name="Personality">
/// Wire name of the personality to take over with, e.g. <c>"aggressive"</c>.
/// Omit for a weighted-random pick (<c>AiPlayersOptions.PersonalityWeights</c>),
/// same as the periodic sweep.
/// </param>
public sealed record TakeOverSettlementRequest(string? Personality = null);

/// <param name="Kind">Wire name, e.g. <c>"reachbuildinglevel"</c>.</param>
/// <param name="Building">Required (and only meaningful) for <c>reachbuildinglevel</c>.</param>
/// <param name="Resource">Required (and only meaningful) for <c>productionrate</c>.</param>
/// <param name="Target">Must be greater than zero.</param>
public sealed record AiObjectiveRequest(
    [property: Required] string Kind,
    string? Building = null,
    string? Resource = null,
    double Target = 0);

/// <param name="Personality">Wire name of the new personality. Omit to leave it unchanged.</param>
/// <param name="Objectives">The new full objective list, replacing the old one. Omit to leave it unchanged.</param>
public sealed record UpdateAiPlayerRequest(
    string? Personality = null,
    IReadOnlyList<AiObjectiveRequest>? Objectives = null);
