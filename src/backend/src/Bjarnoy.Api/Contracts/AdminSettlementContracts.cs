using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <summary>A settlement row in the admin search/list.</summary>
public sealed record AdminSettlementSummary(
    Guid Id, Guid WorldId, string WorldName, string Name, string OwnerName, int Q, int R, int LonghouseLevel)
{
    public static AdminSettlementSummary From(SettlementEntity entity)
    {
        ArgumentNullException.ThrowIfNull(entity);
        ArgumentNullException.ThrowIfNull(entity.World);

        return new AdminSettlementSummary(
            entity.Id,
            entity.WorldId,
            entity.World.Name,
            entity.Name,
            entity.OwnerName,
            entity.CentreQ,
            entity.CentreR,
            entity.Buildings.FirstOrDefault(b => b.Type == Domain.Buildings.BuildingType.Longhouse)?.Level ?? 0);
    }
}

public sealed record PagedAdminSettlementsResponse(
    IReadOnlyList<AdminSettlementSummary> Items,
    int TotalCount,
    int Page,
    int PageSize);

/// <param name="Wood">Signed delta; negative removes resources. Omitted components default to 0.</param>
public sealed record GrantResourcesRequest(
    double Wood = 0, double Stone = 0, double Food = 0, double Iron = 0)
{
    public ResourceAmounts ToDelta() => new(Wood, Stone, Food, Iron);
}

public sealed record SetBuildingLevelRequest([property: Required, Range(1, int.MaxValue)] int Level);

/// <param name="Builds">Whether to finish the build queue. Defaults to true.</param>
/// <param name="Training">Whether to finish the training queue too. Defaults to true.</param>
public sealed record CompleteQueuesRequest(bool Builds = true, bool Training = true);

/// <summary>What an admin's insta-complete actually finished.</summary>
public sealed record CompleteQueuesResponse(
    int CompletedBuilds, int CompletedTraining, SettlementResponse Settlement);

/// <param name="Building">Wire name of the building type, e.g. <c>"lumberjack"</c>.</param>
/// <param name="Level">The level it should stand at.</param>
public sealed record PlaceBuildingRequest(
    [property: Required] string Building,
    [property: Required, Range(1, int.MaxValue)] int Level);

/// <param name="Unit">Wire name of the unit type, e.g. <c>"spearman"</c>.</param>
/// <param name="Count">Signed: positive creates units, negative removes them. Zero is refused.</param>
public sealed record AdjustGarrisonRequest(
    [property: Required] string Unit,
    int Count);

/// <summary>
/// One hex of the settlement's claimed area, as the graphical editor needs it:
/// what terrain it is, and what (if anything) stands there.
/// </summary>
public sealed record AdminSettlementHexResponse(
    int Q,
    int R,
    string Terrain,
    bool IsCoastalWater,
    string? Building,
    int? Level,
    bool IsCentre);

/// <summary>The editable canvas for one settlement: every claimed hex, plus which building types may go on it.</summary>
/// <param name="ClaimRadius">
/// The centre disc's own radius only (<c>Settlement.ClaimRadius</c>) — a
/// single number the UI can display next to the longhouse level.
/// <paramref name="Hexes"/> is the settlement's full claimed territory,
/// including any Tower satellite discs (<c>Settlement.ClaimDiscs</c>), and
/// is what the editor actually paints and what <c>PlaceBuilding</c> actually
/// accepts — the two can disagree in extent once a Tower is standing.
/// </param>
public sealed record AdminSettlementLayoutResponse(
    Guid SettlementId,
    int ClaimRadius,
    IReadOnlyList<AdminSettlementHexResponse> Hexes,
    IReadOnlyList<string> BuildingTypes,
    int MaxLevel);
