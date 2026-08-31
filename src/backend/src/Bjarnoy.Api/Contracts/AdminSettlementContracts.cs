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
