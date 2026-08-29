using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
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

/// <param name="Stock">Whole units, as a player sees them.</param>
/// <param name="RatePerHour">
/// Production per hour. Zero on every resource while the world is paused would
/// be misleading, so this is the rate the settlement <em>has</em>; whether it is
/// currently accruing is <c>world.running</c>.
/// </param>
public sealed record ResourcesResponse(
    ResourceLine Stock,
    ResourceLine RatePerHour,
    ResourceLine Capacity)
{
    public static ResourcesResponse From(ResourceAmounts stock, ResourceAmounts rate, ResourceAmounts capacity) =>
        new(ResourceLine.From(stock.Floor()), ResourceLine.From(rate), ResourceLine.From(capacity));
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

/// <param name="CompletesInSeconds">
/// Remaining game time. Null while the world is frozen, because the countdown
/// is suspended rather than merely postponed.
/// </param>
public sealed record BuildOrderResponse(
    Guid Id,
    int Q,
    int R,
    string Building,
    int TargetLevel,
    DateTimeOffset CompletesAtGameTime,
    double? CompletesInSeconds);

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
    IReadOnlyList<PlacedBuildingResponse> Buildings,
    IReadOnlyList<BuildOrderResponse> Queue,
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
                domain.Resources.At(gameNow), domain.Resources.RatePerHour, domain.Resources.Capacity),
            [.. domain.Buildings.Select(b =>
                new PlacedBuildingResponse(
                    b.Coord.Q, b.Coord.R, b.Type.ToWireName(), b.Level, OrientationFor(b.Type, b.Coord)))],
            [.. domain.Queue.Select(o => new BuildOrderResponse(
                o.Id,
                o.Coord.Q,
                o.Coord.R,
                o.Type.ToWireName(),
                o.TargetLevel,
                o.CompletesAt,
                clock.FreezesTime ? null : o.RemainingAt(gameNow).TotalSeconds))],
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

public sealed record SetWorldStateRequest(
    [property: Required] string State,
    [property: Range(0, 365 * 24 * 3600)] double GraceSeconds = 0);

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
    int RequiredLonghouseLevel)
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
            definition.RequiredLonghouseLevel);
    }
}

/// <summary>A settlement as it appears on the world map: enough to draw a marker.</summary>
public sealed record SettlementSummary(
    Guid Id, string Name, string OwnerName, int Q, int R, int LonghouseLevel);
