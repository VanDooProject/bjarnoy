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

/// <summary>A Town Square feast in progress (economy.md section 6).</summary>
/// <param name="EndsAtGameTime">When the feast ends and grants its renown.</param>
/// <param name="EndsInSeconds">Null while the world's clock is frozen.</param>
/// <param name="RenownGain">Renown the account gains when it ends.</param>
public sealed record FeastResponse(
    DateTimeOffset StartedAtGameTime,
    DateTimeOffset EndsAtGameTime,
    double? EndsInSeconds,
    double RenownGain)
{
    public static FeastResponse From(Feast feast, GameClock clock, DateTimeOffset gameNow) => new(
        feast.StartedAt,
        feast.EndsAt,
        clock.FreezesTime ? null : Math.Max(0, (feast.EndsAt - gameNow).TotalSeconds),
        feast.RenownGain);
}

/// <summary>What holding a feast here would cost and grant, at the standing Town Square's level.</summary>
public sealed record FeastOfferResponse(
    int TownSquareLevel,
    ResourceLine Cost,
    double DurationSeconds,
    double RenownGain);

/// <summary>An onboarding quest and where this settlement stands on it (economy.md section 7).</summary>
/// <param name="Id">The quest's stable id (for example <c>longhouse2</c>).</param>
/// <param name="Completed">Whether its condition is met right now.</param>
/// <param name="Claimed">Whether its reward was already claimed.</param>
/// <param name="Reward">Wood, stone and food paid on claim (clamped to storage).</param>
public sealed record QuestResponse(string Id, bool Completed, bool Claimed, ResourceLine Reward);

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
    FeastResponse? Feast,
    FeastOfferResponse? NextFeast,
    IReadOnlyList<QuestResponse> Quests,
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
                    ? o.BaseDuration.TotalSeconds * domain.BuildTimeFactor / speedFactor
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
            domain.Feast is { } feast && !feast.IsComplete(gameNow) ? FeastResponse.From(feast, clock, gameNow) : null,
            domain.TownSquareLevel > 0
                ? new FeastOfferResponse(
                    domain.TownSquareLevel,
                    ResourceLine.From(Feasts.CostFor(domain.TownSquareLevel)),
                    Feasts.Duration.TotalSeconds / speedFactor,
                    Feasts.RenownFor(domain.TownSquareLevel))
                : null,
            [.. Bjarnoy.Domain.Settlers.Quests.All.Select(q => new QuestResponse(
                q.Id, q.IsCompleted(domain), domain.HasClaimed(q), ResourceLine.From(q.Reward)))],
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

/// <summary>
/// Another building the settlement must already have standing, at
/// <paramref name="Level"/> or higher, before this one may be placed.
/// </summary>
public sealed record BuildingPrerequisiteResponse(string Type, int Level);

/// <param name="AllowedTerrain">
/// Empty both for "any land" and for a <paramref name="RequiresCoastalWater"/>
/// building — check that flag first; it means <em>land</em> terrain plays no
/// part in this building's placement at all, not "anywhere."
/// </param>
/// <param name="AlsoOnCoastalWater">
/// The building stands on land (<paramref name="AllowedTerrain"/>) <em>and</em>, as an exception, on a coastal-water hex: the palisade's
/// sea end. Unlike <paramref name="RequiresCoastalWater"/> it does not replace the land terrain.
/// </param>
/// <param name="Prerequisites">
/// Other buildings that must stand before this one may be placed — <em>all</em>
/// of them, not any one. Empty when there are none. These gate placement, so
/// they are listed on the level whose construction they gate: level 1 for
/// every building today, and every level for the Great Storehouse (a flat
/// level-10-only tier).
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
    bool AlsoOnCoastalWater,
    int RequiredLonghouseLevel,
    int SlotCost,
    bool OccupiesAllSlots,
    int ClaimRadius,
    IReadOnlyList<BuildingPrerequisiteResponse> Prerequisites)
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
            definition.AlsoOnCoastalWater,
            definition.RequiredLonghouseLevel,
            definition.SlotCost,
            definition.OccupiesAllSlots,
            definition.ClaimRadius,
            [.. definition.Prerequisites.Select(p => new BuildingPrerequisiteResponse(p.Type.ToWireName(), p.Level))]);
    }
}

/// <summary>A settlement as it appears on the world map: enough to draw a marker.</summary>
public sealed record SettlementSummary(
    Guid Id, string Name, string OwnerName, int Q, int R, int LonghouseLevel, Guid IslandId);

/// <summary>
/// <c>GET /settlements/{id}/view</c>'s fog-gated read: what a rival's
/// explored ground on the world map earns them — identity, position and
/// <paramref name="Buildings"/> only (and only the ones standing on a hex
/// they've actually explored). Deliberately missing everything
/// <see cref="SettlementResponse"/> carries beyond that: no stock, rates,
/// construction queue, garrison, training queue or runes — none of that is
/// something a rival's own map view could ever have told them, so none of it
/// belongs in a read that answers for anyone but the owner.
/// </summary>
public sealed record SettlementViewResponse(
    Guid Id,
    string Name,
    string OwnerName,
    int Q,
    int R,
    int LonghouseLevel,
    Guid IslandId,
    IReadOnlyList<PlacedBuildingResponse> Buildings);

/// <summary>
/// The caller's own renown in one world (issue #55 §3), plus the settlement
/// count it is measured against and the threshold for one more — everything
/// a "found another settlement" UI needs in one call.
/// </summary>
public sealed record RenownResponse(
    double Total,
    int SettlementCount,
    double RequiredForNextSettlement,
    bool CanFoundAnother,
    double PerHour,
    double PendingFeastRenown)
{
    /// <param name="perHour">Renown per hour the buildings currently accrue (feasts excluded).</param>
    /// <param name="pendingFeastRenown">Renown running feasts (and uncollected ones) will still add.</param>
    public static RenownResponse From(double total, int settlementCount, double perHour = 0, double pendingFeastRenown = 0) => new(
        total,
        settlementCount,
        RenownThresholds.RequiredFor(settlementCount + 1),
        RenownThresholds.AllowsAnotherSettlement(settlementCount, total),
        perHour,
        pendingFeastRenown);
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
    string? RequiredUnitType,
    string RequiredBuildingType)
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
            definition.RequiredUnitType?.ToWireName(),
            definition.RequiredBuildingType.ToWireName());
    }
}
