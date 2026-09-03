using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Api.Contracts;

/// <param name="OwnerId">
/// A stable id for the player founding this settlement (a client-generated
/// local id today; a real account id once auth exists). Used to refuse a
/// second settlement for the same player in the same world — see
/// <see cref="Bjarnoy.Infrastructure.Services.FoundingRejection.AlreadyFounded"/>.
/// Unrelated to <c>OwnerName</c>, which is just the display name shown on
/// the map and can collide between players.
/// </param>
public sealed record FoundSettlementRequest(
    [property: Required] Guid IslandId,
    int Q,
    int R,
    [property: Required, MinLength(2), MaxLength(100)] string Name,
    [property: Required, MinLength(2), MaxLength(100)] string OwnerName,
    [property: Required, MinLength(1), MaxLength(200)] string OwnerId);

public sealed record QueueBuildRequest(
    [property: Required] string Building,
    int Q,
    int R);

/// <param name="Q">The hex a shrine stands on, to slot this rune into.</param>
public sealed record SlotRuneRequest(int Q, int R);

public sealed record TrainUnitsRequest(
    [property: Required] string Unit,
    [property: Range(1, int.MaxValue)] int Count);

/// <param name="Stock">Whole units, as a player sees them.</param>
/// <param name="RatePerHour">
/// Production per hour. Zero on every resource while the world is paused would
/// be misleading, so this is the rate the settlement <em>has</em>; whether it is
/// currently accruing is <c>world.running</c>.
/// </param>
/// <param name="Reserved">
/// Earmarked for the premium waiting queue (issue #158 stage 1c) — still
/// physically sitting in <see cref="Stock"/> (still raidable, still counted
/// against <see cref="Capacity"/>), but unspendable on anything voluntary:
/// another build, training, trade, dispatch provisions, a guild fee. Lives
/// here, not under construction, because every one of those other panels has
/// to respect it too.
/// </param>
/// <param name="Available"><see cref="Stock"/> minus <see cref="Reserved"/>, floored at zero — what a client should actually offer the player to spend.</param>
public sealed record ResourcesResponse(
    ResourceLine Stock,
    ResourceLine RatePerHour,
    ResourceLine Capacity,
    ResourceLine Reserved,
    ResourceLine Available)
{
    public static ResourcesResponse From(
        ResourceAmounts stock, ResourceAmounts rate, ResourceAmounts capacity, ResourceAmounts reserved, ResourceAmounts available) =>
        new(
            ResourceLine.From(stock.Floor()),
            ResourceLine.From(rate),
            ResourceLine.From(capacity),
            ResourceLine.From(reserved.Floor()),
            ResourceLine.From(available.Floor()));
}

public sealed record ResourceLine(double Wood, double Stone, double Food, double Iron)
{
    public static ResourceLine From(ResourceAmounts a) => new(a.Wood, a.Stone, a.Food, a.Iron);
}

/// <param name="Orientation">
/// Which art-pack rotation to render the building with — set only for a
/// building whose art has a fixed connection to something around it (today,
/// the fishing hut's dock, which must face this settlement's own shore
/// rather than the coastal-water hex's generic, ownerless orientation). Null
/// for anything else; the tile's own <c>orientation</c> from
/// <c>GET /worlds/{id}/tiles</c> covers it.
/// </param>
public sealed record PlacedBuildingResponse(int Q, int R, string Type, int Level, string? Orientation = null);

/// <param name="State">
/// <c>"building"</c> while under construction, <c>"waiting"</c> while queued
/// behind a full set of construction slots (issue #158) — the premium
/// waiting queue.
/// </param>
/// <param name="SlotCost">
/// How many construction slots this order occupies once building — every
/// slot the settlement currently has, for a Longhouse upgrade
/// (<c>OccupiesAllSlots</c>); otherwise the catalogue's per-order
/// <c>SlotCost</c> (1 for everything today).
/// </param>
/// <param name="CompletesAtGameTime">
/// <see langword="null"/> for a waiting order — it has not started, so there
/// is no real completion instant yet, only <see cref="TotalSeconds"/>'s
/// estimate.
/// </param>
/// <param name="CompletesInSeconds">
/// Remaining game time. Null while the world is frozen (the countdown is
/// suspended rather than merely postponed) or while the order is still
/// waiting for a slot.
/// </param>
/// <param name="TotalSeconds">
/// The order's full build duration (from <c>StartedAt</c> to
/// <c>CompletesAt</c>) for a started order, so the client can compute
/// progress as an absolute fraction of the whole order instead of relative
/// to whenever it last polled — see issue #99. For a still-waiting order this
/// is an <em>estimate</em> — the catalogue's base duration at the world's
/// current speed factor — since the real duration is only decided at
/// promotion, whatever the speed factor is then.
/// </param>
public sealed record BuildOrderResponse(
    Guid Id,
    int Q,
    int R,
    string Building,
    int TargetLevel,
    string State,
    int SlotCost,
    DateTimeOffset? CompletesAtGameTime,
    double? CompletesInSeconds,
    double TotalSeconds);

public sealed record UnitStackResponse(string Unit, int Count);

/// <param name="SlottedAtQ">
/// The shrine hex this rune is slotted into, or <see langword="null"/> if it
/// is sitting unslotted in storage (issue #53). <see cref="SlottedAtR"/> is
/// always set alongside it.
/// </param>
public sealed record RuneInstanceResponse(
    Guid Id, string Type, string Rarity, int? SlottedAtQ, int? SlottedAtR);

/// <param name="CompletedCount">
/// How many units of the batch are done so far — display only; they land in
/// the garrison all at once when the whole batch completes (see
/// <c>TrainingOrder</c>'s remarks).
/// </param>
/// <param name="CompletesInSeconds">
/// Remaining game time until the last unit in the batch finishes. Null while
/// the world is frozen — same reasoning as <see cref="BuildOrderResponse"/>.
/// </param>
/// <param name="TotalSeconds">
/// The batch's full duration (<c>PerUnitDuration * Count</c>), for the same
/// absolute-progress reason as <see cref="BuildOrderResponse.TotalSeconds"/>.
/// </param>
public sealed record TrainingOrderResponse(
    Guid Id,
    string Unit,
    int Count,
    int CompletedCount,
    DateTimeOffset CompletesAtGameTime,
    double? CompletesInSeconds,
    double TotalSeconds);

/// <param name="MaxWaitingOrders">
/// Zero means the waiting queue is premium-locked for this settlement — the
/// client's only signal that premium is required, so it never needs its own
/// premium flag. Non-zero (currently always <c>Settlement.MaxWaitingOrders</c>)
/// means the player can queue behind a full set of slots.
/// </param>
/// <param name="MaxOrdersPerHex">
/// Always 1 today (<c>Settlement.DefaultMaxOrdersPerHex</c>) — the same
/// "read the cap off the response" trick as <see cref="MaxWaitingOrders"/>,
/// this time for the stage 1d per-hex stacking tier once it exists.
/// </param>
public sealed record ConstructionResponse(int Slots, int SlotsUsed, int MaxWaitingOrders, int WaitingOrders, int MaxOrdersPerHex);

public sealed record SettlementResponse(
    Guid Id,
    Guid WorldId,
    Guid IslandId,
    string Name,
    string OwnerName,
    int Q,
    int R,
    int LonghouseLevel,
    int ClaimRadius,
    ResourcesResponse Resources,
    ConstructionResponse Construction,
    IReadOnlyList<PlacedBuildingResponse> Buildings,
    IReadOnlyList<BuildOrderResponse> Queue,
    IReadOnlyList<UnitStackResponse> Garrison,
    IReadOnlyList<TrainingOrderResponse> TrainingQueue,
    IReadOnlyList<RuneInstanceResponse> Runes,
    WorldClockResponse World)
{
    public static SettlementResponse From(
        SettlementEntity entity, GameClock clock, DateTimeOffset gameNow)
    {
        ArgumentNullException.ThrowIfNull(entity);

        var domain = entity.ToDomain();
        var centre = new HexCoord(entity.CentreQ, entity.CentreR);

        // Only a fishing hut needs its own orientation (see PlacedBuildingResponse),
        // so the sampler this requires is built lazily rather than for every
        // settlement read.
        TerrainSampler? sampler = null;
        string? OrientationFor(BuildingType type, HexCoord coord)
        {
            if (type != BuildingType.FishingHut || entity.World is null)
            {
                return null;
            }

            sampler ??= new TerrainSampler(entity.World.ToGenerationOptions());
            return sampler.FishingHutOrientation(coord, centre).ToWireName();
        }

        var speedFactor = entity.World?.SpeedFactor ?? 1.0;
        var isPremium = entity.Owner?.IsPremium ?? false;
        var maxWaitingOrders = isPremium ? Settlement.MaxWaitingOrders : 0;

        return new SettlementResponse(
            entity.Id,
            entity.WorldId,
            entity.IslandId,
            entity.Name,
            entity.OwnerName,
            entity.CentreQ,
            entity.CentreR,
            domain.LonghouseLevel,
            domain.ClaimRadius,
            ResourcesResponse.From(
                domain.Resources.At(gameNow),
                domain.Resources.RatePerHour,
                domain.Resources.Capacity,
                domain.ReservedResources,
                domain.AvailableResources(gameNow)),
            new ConstructionResponse(
                domain.ConstructionSlots,
                domain.UsedSlots,
                maxWaitingOrders,
                domain.WaitingOrders.Count(),
                Settlement.DefaultMaxOrdersPerHex),
            [.. domain.Buildings.Select(b =>
                new PlacedBuildingResponse(
                    b.Coord.Q, b.Coord.R, b.Type.ToWireName(), b.Level, OrientationFor(b.Type, b.Coord)))],
            [.. domain.Queue.Select(o => new BuildOrderResponse(
                o.Id,
                o.Coord.Q,
                o.Coord.R,
                o.Type.ToWireName(),
                o.TargetLevel,
                o.IsWaiting ? "waiting" : "building",
                BuildingCatalogue.Get(o.Type, o.TargetLevel).OccupiesAllSlots
                    ? domain.ConstructionSlots
                    : BuildingCatalogue.Get(o.Type, o.TargetLevel).SlotCost,
                o.CompletesAt,
                (clock.FreezesTime || o.IsWaiting) ? null : o.RemainingAt(gameNow).TotalSeconds,
                o.IsWaiting
                    ? o.BaseDuration.TotalSeconds / speedFactor
                    : (o.CompletesAt!.Value - o.StartedAt!.Value).TotalSeconds))],
            [.. domain.Garrison.Select(g => new UnitStackResponse(g.Type.ToWireName(), g.Count))],
            [.. domain.TrainingQueue.Select(o => new TrainingOrderResponse(
                o.Id,
                o.UnitType.ToWireName(),
                o.Count,
                o.CompletedCount(gameNow),
                o.CompletesAt,
                clock.FreezesTime ? null : o.RemainingAt(gameNow).TotalSeconds,
                o.PerUnitDuration.TotalSeconds * o.Count))],
            [.. domain.Runes.Select(r => new RuneInstanceResponse(
                r.Id, r.Type.ToWireName(), r.Rarity.ToWireName(), r.SlottedAt?.Q, r.SlottedAt?.R))],
            WorldClockResponse.From(clock, gameNow));
    }
}

/// <param name="Running">Whether game time is advancing.</param>
/// <param name="AcceptsCommands">Whether new actions are being taken.</param>
public sealed record WorldClockResponse(
    string State,
    bool Running,
    bool AcceptsCommands,
    DateTimeOffset GameTime)
{
    public static WorldClockResponse From(GameClock clock, DateTimeOffset gameNow) => new(
        clock.State.ToString().ToLowerInvariant(),
        !clock.FreezesTime,
        clock.AllowsCommands,
        gameNow);
}

/// <param name="AllowedTerrain">
/// Empty both for "any land" and for a <paramref name="RequiresCoastalWater"/>
/// building — check that flag first; it means <em>land</em> terrain plays no
/// part in this building's placement at all, not "anywhere."
/// </param>
public sealed record BuildingDefinitionResponse(
    string Type,
    int Level,
    ResourceLine Cost,
    double BuildSeconds,
    ResourceLine ProductionPerHour,
    ResourceLine StorageCapacity,
    IReadOnlyList<string> AllowedTerrain,
    bool RequiresCoastalWater,
    int RequiredLonghouseLevel,
    int SlotCost,
    bool OccupiesAllSlots)
{
    public static BuildingDefinitionResponse From(BuildingDefinition definition)
    {
        ArgumentNullException.ThrowIfNull(definition);

        return new BuildingDefinitionResponse(
            definition.Type.ToWireName(),
            definition.Level,
            ResourceLine.From(definition.Cost),
            definition.BuildDuration.TotalSeconds,
            ResourceLine.From(definition.ProductionPerHour),
            ResourceLine.From(definition.StorageCapacity),
            [.. definition.AllowedTerrain.Select(t => t.ToWireName()).Order(StringComparer.Ordinal)],
            definition.RequiresCoastalWater,
            definition.RequiredLonghouseLevel,
            definition.SlotCost,
            definition.OccupiesAllSlots);
    }
}

/// <summary>A settlement as it appears on the world map: enough to draw a marker.</summary>
public sealed record SettlementSummary(
    Guid Id, string Name, string OwnerName, int Q, int R, int LonghouseLevel, Guid IslandId);

/// <summary>
/// The caller's own renown in one world (issue #55 §3), plus the settlement
/// count it is measured against and the threshold for one more — everything
/// a "found another settlement" UI needs in one call.
/// </summary>
public sealed record RenownResponse(double Total, int SettlementCount, double RequiredForNextSettlement, bool CanFoundAnother)
{
    public static RenownResponse From(double total, int settlementCount) => new(
        total,
        settlementCount,
        RenownThresholds.RequiredFor(settlementCount + 1),
        RenownThresholds.AllowsAnotherSettlement(settlementCount, total));
}

public sealed record UnitDefinitionResponse(
    string Type,
    string Class,
    int Attack,
    int Defense,
    double Speed,
    int CarryCapacity,
    int FoodCarryCapacity,
    double UpkeepPerHour,
    ResourceLine TrainingCost,
    double TrainingSeconds,
    int RequiredLonghouseLevel,
    string? RequiredUnitType)
{
    public static UnitDefinitionResponse From(UnitDefinition definition)
    {
        ArgumentNullException.ThrowIfNull(definition);

        return new UnitDefinitionResponse(
            definition.Type.ToWireName(),
            definition.Class.ToString().ToLowerInvariant(),
            definition.Attack,
            definition.Defense,
            definition.Speed,
            definition.CarryCapacity,
            definition.FoodCarryCapacity,
            definition.UpkeepPerHour,
            ResourceLine.From(definition.TrainingCost),
            definition.TrainingDuration.TotalSeconds,
            definition.RequiredLonghouseLevel,
            definition.RequiredUnitType?.ToWireName());
    }
}
