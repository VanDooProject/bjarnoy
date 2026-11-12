using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// The stored form of a <see cref="Gathering"/>: where the groups of an army sent from several garrison spots meet, when they leave
/// together and the order the merged army carries out. The groups are armies pointing here with <see cref="ArmyEntity.GatheringId"/>.
/// </summary>
public class GatheringEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    /// <summary>The join hex — <see cref="Gathering.Hex"/>.</summary>
    public int HexQ { get; set; }

    public int HexR { get; set; }

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset DepartAt { get; set; }

    public int Mission { get; set; }

    public Guid? TargetSettlementId { get; set; }

    public int? TargetBuildingQ { get; set; }

    public int? TargetBuildingR { get; set; }

    public int? TargetCampQ { get; set; }

    public int? TargetCampR { get; set; }

    /// <summary>The hexes the merged army walks to in order after the join hex.</summary>
    public List<HexPoint> Stops { get; set; } = [];

    public int HomeSpotQ { get; set; }

    public int HomeSpotR { get; set; }

    /// <summary>The sea meeting a boarded fleet joins when it leaves this gathering; null for every other gathering.</summary>
    public Guid? ParentGatheringId { get; set; }

    public GatheringEntity? ParentGathering { get; set; }

    public Gathering ToDomain() => new()
    {
        Id = Id,
        SettlementId = SettlementId,
        Hex = new HexCoord(HexQ, HexR),
        DepartAt = DepartAt,
        Mission = (ArmyMission)Mission,
        TargetSettlementId = TargetSettlementId,
        TargetBuildingCoord = TargetBuildingQ is { } bq ? new HexCoord(bq, TargetBuildingR!.Value) : null,
        TargetCampCoord = TargetCampQ is { } cq ? new HexCoord(cq, TargetCampR!.Value) : null,
        Stops = [.. Stops.Select(p => new HexCoord(p.Q, p.R))],
        HomeSpot = new HexCoord(HomeSpotQ, HomeSpotR),
        ParentGatheringId = ParentGatheringId,
    };

    public static GatheringEntity From(Gathering gathering) => new()
    {
        Id = gathering.Id,
        SettlementId = gathering.SettlementId,
        HexQ = gathering.Hex.Q,
        HexR = gathering.Hex.R,
        DepartAt = gathering.DepartAt,
        Mission = (int)gathering.Mission,
        TargetSettlementId = gathering.TargetSettlementId,
        TargetBuildingQ = gathering.TargetBuildingCoord?.Q,
        TargetBuildingR = gathering.TargetBuildingCoord?.R,
        TargetCampQ = gathering.TargetCampCoord?.Q,
        TargetCampR = gathering.TargetCampCoord?.R,
        Stops = [.. gathering.Stops.Select(c => new HexPoint(c.Q, c.R))],
        HomeSpotQ = gathering.HomeSpot.Q,
        HomeSpotR = gathering.HomeSpot.R,
        ParentGatheringId = gathering.ParentGatheringId,
    };
}
