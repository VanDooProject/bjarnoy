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

    /// <summary>The land hex beside a dock on the water where land groups board — <see cref="Gathering.BoardingHex"/>; both columns set or both null.</summary>
    public int? BoardingQ { get; set; }

    public int? BoardingR { get; set; }

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

    /// <summary>Persisted mirror of <see cref="Gathering.IsFleet"/>.</summary>
    public bool IsFleet { get; set; }

    /// <summary>
    /// Optimistic-concurrency token, the same pattern as <see cref="SettlementEntity.Version"/>: changed with every write, so a recall of a
    /// group racing the merge of its gathering raises a concurrency exception and is retried instead of being lost.
    /// </summary>
    public Guid Version { get; set; } = Guid.NewGuid();

    public GatheringEntity? ParentGathering { get; set; }

    public Gathering ToDomain() => new()
    {
        Id = Id,
        SettlementId = SettlementId,
        Hex = new HexCoord(HexQ, HexR),
        BoardingHex = BoardingQ is { } boardingQ ? new HexCoord(boardingQ, BoardingR!.Value) : null,
        DepartAt = DepartAt,
        IsFleet = IsFleet,
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
        BoardingQ = gathering.BoardingHex?.Q,
        BoardingR = gathering.BoardingHex?.R,
        DepartAt = gathering.DepartAt,
        IsFleet = gathering.IsFleet,
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
