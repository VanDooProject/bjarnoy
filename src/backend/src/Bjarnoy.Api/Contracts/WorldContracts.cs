using System.ComponentModel.DataAnnotations;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.World;

namespace Bjarnoy.Api.Contracts;

/// <param name="Seed">
/// Omit to have one drawn at random. The seed is the world: with the generation
/// constants it is enough to reproduce every hex of terrain.
/// </param>
/// <param name="Generation">
/// Overrides for the island/mountain generation constants — any field left
/// <see langword="null"/> keeps the library default (see
/// <see cref="WorldGenerationSettingsOverrides"/>). Omit entirely for the default world.
/// </param>
public sealed record CreateWorldRequest(
    [property: Required, MinLength(3), MaxLength(100)] string Name,
    int? Seed = null,
    [property: Range(1, WorldGenerationOptions.MaxRadius)] int Radius = 4000,
    [property: Range(1, 100000)] int MaxPlayers = 500,
    WorldGenerationSettingsOverrides? Generation = null);

public sealed record WorldResponse(
    Guid Id,
    string Name,
    int Seed,
    int Radius,
    int MaxPlayers,
    string Status,
    int IslandCount,
    DateTimeOffset CreatedAt,
    bool Joinable,
    string JoinableReason,
    DateTimeOffset? StartsAt,
    bool EndbossTriggered,
    bool FrozenIslesEnabled,
    double SpeedFactor,
    WorldGenerationResponse Generation,
    WorldMovementResponse Movement)
{
    public static WorldResponse From(WorldEntity world, int islandCount, int playerCount, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(world);

        var joinability = world.DetermineJoinability(playerCount, now);

        return new WorldResponse(
            world.Id,
            world.Name,
            world.Seed,
            world.Radius,
            world.MaxPlayers,
            world.Status.ToString().ToLowerInvariant(),
            islandCount,
            world.CreatedAt,
            joinability.Joinable,
            joinability.Reason.ToString().ToLowerInvariant(),
            world.StartsAt,
            world.EndbossTriggeredAt is not null,
            world.FrozenIslesEnabled,
            world.SpeedFactor,
            WorldGenerationResponse.From(world.ToGenerationOptions()),
            WorldMovementResponse.Current);
    }
}

/// <summary>
/// A world as offered to a player choosing where to join (the "join another
/// world" flow) — deliberately narrower than <see cref="WorldResponse"/>: no
/// seed, generation parameters, or radius, since none of that is map-reproducing
/// data a player picking a world from a list needs, and handing it out would
/// let a client precompute the whole map before ever landing on it.
/// </summary>
/// <param name="FreeSlots"><c>max(0, MaxPlayers - PlayerCount)</c> — what the picker actually needs to show, without making every caller re-derive it.</param>
public sealed record JoinableWorldResponse(
    Guid Id,
    string Name,
    int PlayerCount,
    int MaxPlayers,
    int FreeSlots,
    bool Joinable,
    string JoinableReason,
    DateTimeOffset? StartsAt,
    double SpeedFactor,
    DateTimeOffset CreatedAt,
    string Status)
{
    public static JoinableWorldResponse From(WorldEntity world, int playerCount, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(world);

        var joinability = world.DetermineJoinability(playerCount, now);

        return new JoinableWorldResponse(
            world.Id,
            world.Name,
            playerCount,
            world.MaxPlayers,
            Math.Max(0, world.MaxPlayers - playerCount),
            joinability.Joinable,
            joinability.Reason.ToString().ToLowerInvariant(),
            world.StartsAt,
            world.SpeedFactor,
            world.CreatedAt,
            world.Status.ToString().ToLowerInvariant());
    }
}

/// <summary>
/// The minimal public listing for <c>GET /api/v1/worlds</c> — world creation
/// moved to admin-only, so the old listing reusing <see cref="WorldResponse"/>
/// (the very shape that carried seed/radius/generation to any anonymous
/// caller) stopped making sense. Same idea as <see cref="JoinableWorldResponse"/>,
/// one level up: a player choosing which world to look at needs its name,
/// whether it's open, and how full it is — nothing that would let a client
/// precompute its map. <c>GET /worlds/{worldId}</c> (<see cref="WorldResponse"/>)
/// is still where the game client fetches the full config once a world is
/// actually picked.
/// </summary>
public sealed record WorldSummaryResponse(
    Guid Id,
    string Name,
    string Status,
    bool Joinable,
    string JoinableReason,
    int PlayerCount,
    int MaxPlayers,
    int FreeSlots,
    DateTimeOffset? StartsAt)
{
    public static WorldSummaryResponse From(WorldEntity world, int playerCount, DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(world);

        var joinability = world.DetermineJoinability(playerCount, now);

        return new WorldSummaryResponse(
            world.Id,
            world.Name,
            world.Status.ToString().ToLowerInvariant(),
            joinability.Joinable,
            joinability.Reason.ToString().ToLowerInvariant(),
            playerCount,
            world.MaxPlayers,
            Math.Max(0, world.MaxPlayers - playerCount),
            world.StartsAt);
    }
}

/// <summary>
/// Whether the requesting owner already has a settlement in a given world —
/// the "join another world" flow's per-world check before offering a plot.
/// </summary>
/// <param name="SettlementId">
/// Null when this owner has no settlement in this world; a non-null value
/// (with <see cref="SettlementName"/> also set) means they do.
/// </param>
public sealed record WorldMembershipResponse(Guid WorldId, string? SettlementId, string? SettlementName);

/// <summary>
/// The generation constants a world was created with (issue #159 part B) — a
/// world's <see cref="Bjarnoy.Domain.World.WorldGenerationOptions"/>, projected
/// so the client can mirror the exact terrain the server paths over instead of
/// the hardcoded module constants <c>lib/map/worldGenerator.ts</c> used before
/// this, which silently went stale for any world reseeded with non-default
/// options (<c>POST /api/v1/admin/worlds/{id}/preview-seed</c>).
/// </summary>
public sealed record WorldGenerationResponse(
    int WorldRadius,
    int IslandCellSize,
    double IslandChance,
    double IslandMaxReach,
    double IslandMinGap,
    double IslandMinWidth,
    double IslandMaxWidth,
    int IslandMinSegments,
    int IslandMaxSegments,
    double IslandMinElongation,
    double IslandMaxElongation,
    double IslandMinBend,
    double IslandMaxBend,
    double IslandCoastWarp,
    double IslandCoastWarpScale,
    double IslandCoastNoise,
    double IslandCoastNoiseScale,
    double IslandSmallShare,
    double IslandLargeShare,
    double BeachThreshold,
    double MountainThreshold,
    double MountainRockiness,
    double ForestRockiness)
{
    public static WorldGenerationResponse From(WorldGenerationOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        return new WorldGenerationResponse(
            options.Radius,
            options.IslandCellSize,
            options.IslandChance,
            options.IslandMaxReach,
            options.IslandMinGap,
            options.IslandMinWidth,
            options.IslandMaxWidth,
            options.IslandMinSegments,
            options.IslandMaxSegments,
            options.IslandMinElongation,
            options.IslandMaxElongation,
            options.IslandMinBend,
            options.IslandMaxBend,
            options.IslandCoastWarp,
            options.IslandCoastWarpScale,
            options.IslandCoastNoise,
            options.IslandCoastNoiseScale,
            options.IslandSmallShare,
            options.IslandLargeShare,
            options.BeachThreshold,
            options.MountainThreshold,
            options.MountainRockiness,
            options.ForestRockiness);
    }
}

/// <param name="Land">Per-terrain step cost for land armies, keyed by wire terrain name (see <see cref="TileResponse.Terrain"/>). <c>sea</c> is deliberately absent — impassable to land units.</param>
/// <param name="Sea">Per-terrain step cost for fleets. Only <c>sea</c> is present — every land terrain is impassable to ships.</param>
/// <param name="RiverCrossingCost">
/// Flat penalty, on top of terrain cost, for a land unit entering a river hex —
/// <see cref="HexPathfinder.RiverCrossingCost"/>. Not world-specific, but sent
/// here rather than hardcoded client-side so the two cost models cannot drift
/// apart silently (issue #159 part B).
/// </param>
public sealed record WorldMovementResponse(
    IReadOnlyDictionary<string, double> Land,
    IReadOnlyDictionary<string, double> Sea,
    double RiverCrossingCost)
{
    public static readonly WorldMovementResponse Current = new(
        HexPathfinder.LandTerrainCostByName,
        HexPathfinder.SeaTerrainCostByName,
        HexPathfinder.RiverCrossingCost);
}

public sealed record IslandResponse(
    Guid Id,
    int Index,
    string Name,
    int Q,
    int R,
    int TileCount,
    IReadOnlyList<TileCoordinate> StartPositions,
    IReadOnlyList<RiverTileResponse> RiverTiles,
    IReadOnlyList<GiantResponse> Giants,
    bool Wasted,
    IReadOnlyList<CampResponse> Camps,
    IReadOnlyList<BogTileResponse> BogTiles)
{
    public static IslandResponse From(IslandEntity island)
    {
        ArgumentNullException.ThrowIfNull(island);

        return new IslandResponse(
            island.Id,
            island.Index,
            island.Name,
            island.CentreQ,
            island.CentreR,
            island.TileCount,
            [.. island.StartPositions.Select(p => new TileCoordinate(p.Q, p.R))],
            [.. island.RiverTiles.Select(RiverTileResponse.From)],
            [.. island.Giants.Select(GiantResponse.From)],
            island.IsWasted,
            [.. island.Camps.Select(CampResponse.From)],
            [.. island.BogTiles.Select(BogTileResponse.From)]);
    }
}

/// <summary>
/// One hex of an island's bogland — see <see cref="Bjarnoy.Domain.World.BogTile"/> and <c>docs/design/bog.md</c>. A
/// <c>lake</c> hex reads as terrain <c>lake</c>, every other kind as terrain <c>bog</c>.
/// </summary>
/// <param name="Kind">
/// <c>bog</c>, <c>lake</c>, <c>inlet</c>, <c>shore</c>, <c>half</c> (a shore with one, two or three water edges),
/// <c>mouth</c> (an inlet with a creek on the opposite edge), <c>creek</c> or <c>creekspring</c>.
/// </param>
/// <param name="InDirections">The direction a creek, mouth or spring's water comes from; empty otherwise.</param>
/// <param name="OutDirection">The direction it flows out toward, or <see langword="null"/>.</param>
/// <param name="WaterEdges">The directions of the lake neighbours of a shore or mouth, in ascending cyclic order.</param>
public sealed record BogTileResponse(
    int Q,
    int R,
    string Kind,
    IReadOnlyList<string> InDirections,
    string? OutDirection,
    IReadOnlyList<string> WaterEdges)
{
    // Indexed by BogTileKind's own int values.
    private static readonly string[] KindNames = ["bog", "lake", "inlet", "shore", "half", "mouth", "creek", "creekspring"];

    public static BogTileResponse FromDomain(BogTile tile) => new(
        tile.Coord.Q,
        tile.Coord.R,
        KindNames[(int)tile.Kind],
        [.. tile.InDirections.Select(d => d.ToWireName())],
        tile.OutDirection?.ToWireName(),
        [.. tile.WaterEdges.Select(d => d.ToWireName())]);

    public static BogTileResponse From(BogTileRecord tile) => new(
        tile.Q,
        tile.R,
        KindNames[tile.Kind],
        [.. tile.InDirections.Select(d => ((TileOrientation)d).ToWireName())],
        tile.OutDirection is { } outDirection ? ((TileOrientation)outDirection).ToWireName() : null,
        [.. tile.WaterEdges.Select(d => ((TileOrientation)d).ToWireName())]);
}

/// <summary>
/// A wildlife camp — see <see cref="Bjarnoy.Domain.World.Camp"/> and <c>docs/design/wildlife-camps.md</c>.
/// Spawn and render only for now; every camp is guarded.
/// </summary>
/// <param name="Family">The tile-art family, e.g. <c>"wolfden"</c>.</param>
/// <param name="Q">Hex column.</param>
/// <param name="R">Hex row.</param>
/// <param name="Level">Rolled at spawn, 1 to 5; sets <paramref name="GuardRange"/>.</param>
/// <param name="Orientation">The tile's own orientation wire name (a bearrapids camp follows its river).</param>
/// <param name="Strong">Whether the camp will block towers once camp gameplay lands.</param>
/// <param name="GuardRange">How many hex steps around the camp it guards.</param>
public sealed record CampResponse(string Family, int Q, int R, int Level, string Orientation, bool Strong, int GuardRange)
{
    public static CampResponse From(CampRecord camp) => FromDomain(new Camp(
        new HexCoord(camp.Q, camp.R), camp.Family, camp.Level, (TileOrientation)camp.Orientation));

    public static CampResponse FromDomain(Camp camp) => new(
        camp.Family,
        camp.Coord.Q,
        camp.Coord.R,
        camp.Level,
        camp.Orientation.ToWireName(),
        camp.Strong,
        camp.GuardRange);
}

/// <summary>A 7-hex giant feature — see <see cref="Bjarnoy.Domain.World.Giant"/> and the territory rule.</summary>
/// <param name="Family">The tile-art family it renders as, e.g. <c>"giantmountain"</c>.</param>
/// <param name="Q">Anchor hex column.</param>
/// <param name="R">Anchor hex row.</param>
/// <param name="Orientation">
/// The anchor tile's own orientation, as the wire name <see cref="TileOrientationExtensions.ToWireName"/>
/// produces elsewhere (e.g. <c>"E"</c>, <c>"NE"</c>) — the footprint's other 6 hexes render as plain terrain.
/// </param>
public sealed record GiantResponse(string Family, int Q, int R, string Orientation)
{
    public static GiantResponse From(GiantRecord giant) => new(
        giant.Family,
        giant.Q,
        giant.R,
        ((TileOrientation)giant.Orientation).ToWireName());

    public static GiantResponse FromDomain(Giant giant) => new(
        giant.Family,
        giant.Anchor.Q,
        giant.Anchor.R,
        giant.Orientation.ToWireName());
}

public sealed record TileCoordinate(int Q, int R);

/// <summary>
/// The plot a landing-page visitor is offered right now — see
/// <c>PlotReservationService</c>. Never carries an owner id, IP, or anyone
/// else's reservation: only the requesting visitor's own pinned plot and
/// advisory alternatives.
/// </summary>
/// <param name="Reserved">
/// Whether this plot is exclusively held for the requester right now (it
/// may not be, e.g. an abuse cap was hit or the world isn't joinable) — a
/// visitor can always still attempt to found on <see cref="Plot"/> either
/// way, and <c>FoundAsync</c>'s own checks are the real authority.
/// </param>
/// <param name="IslandSettlements">
/// The settlements already standing on <see cref="IslandId"/> — who this
/// visitor's would-be neighbours are. Replaces the pre-founding, world-wide
/// settlement list <c>GET /worlds/{worldId}/settlements</c> used to hand
/// every anonymous caller before that endpoint became fog-gated: a visitor
/// choosing a plot still needs to see the island they're actually looking
/// at, just not every settlement in the world.
/// </param>
public sealed record PlotSuggestionResponse(
    Guid IslandId,
    TileCoordinate Plot,
    IReadOnlyList<TileCoordinate> Alternatives,
    bool Reserved,
    DateTimeOffset? ReservedUntil,
    IReadOnlyList<SettlementSummary> IslandSettlements);

/// <param name="Shape">One of <c>spring</c>, <c>straight</c>, <c>bend</c>, <c>confluence</c>, <c>mouth</c>, <c>bend60</c>.</param>
/// <param name="InDirections">
/// The orientations (<c>E</c>/<c>NE</c>/<c>NW</c>/<c>W</c>/<c>SW</c>/<c>SE</c>) this tile's river
/// flows in from — empty for a spring, two entries for a confluence, one otherwise.
/// </param>
/// <param name="OutDirection">
/// The orientation this tile's river flows out toward, or <see langword="null"/> for a mouth (or
/// a confluence that's also a river's mouth).
/// </param>
/// <param name="Width">
/// <c>river</c>, <c>stream</c> (stream width on every edge) or <c>widen</c> (stream in, river out).
/// </param>
public sealed record RiverTileResponse(
    int Q,
    int R,
    string Shape,
    IReadOnlyList<string> InDirections,
    string? OutDirection,
    string Width = "river")
{
    // Indexed by RiverWidth's int values: what river width the hex is drawn at.
    private static readonly string[] WidthNames = ["river", "stream", "widen", "riverstream"];

    // Indexed by RiverTileShape's own int values — bend60 sits last (not next
    // to bend) because RiverTileShape.Bend60's doc comment explains why it
    // was appended rather than inserted.
    private static readonly string[] ShapeNames = ["spring", "straight", "bend", "confluence", "mouth", "bend60"];

    /// <summary>
    /// The domain's own <see cref="RiverTile"/>, for a map that was generated
    /// but never stored (the admin seed preview, issue #133) and so has no
    /// <see cref="RiverTileRecord"/> row to read from.
    /// </summary>
    public static RiverTileResponse FromDomain(RiverTile tile) => new(
        tile.Coord.Q,
        tile.Coord.R,
        ShapeNames[(int)tile.Shape],
        [.. tile.InDirections.Select(d => d.ToWireName())],
        tile.OutDirection?.ToWireName(),
        WidthNames[(int)tile.Width]);

    public static RiverTileResponse From(RiverTileRecord tile) => new(
        tile.Q,
        tile.R,
        ShapeNames[tile.Shape],
        [.. tile.InDirections.Select(d => ((TileOrientation)d).ToWireName())],
        tile.OutDirection is { } outDirection ? ((TileOrientation)outDirection).ToWireName() : null,
        WidthNames[tile.Width]);
}

/// <param name="Terrain">
/// One of <c>sea</c>, <c>sand</c>, <c>grass</c>, <c>forest</c>, <c>mountain</c>, <c>bog</c>, <c>lake</c> —
/// the frontend's terrain names.
/// </param>
/// <param name="IsCoastalWater">Sea that borders land — the ring a coastal-water sprite belongs on.</param>
/// <param name="Orientation">One of <c>E</c>, <c>NE</c>, <c>NW</c>, <c>W</c>, <c>SW</c>, <c>SE</c> — which art-pack rotation to render.</param>
/// <param name="Variant">Which numbered variant of this terrain's tile art to use.</param>
public sealed record TileResponse(int Q, int R, string Terrain, bool IsCoastalWater, string Orientation, int Variant)
{
    public static TileResponse From(GeneratedTile tile) =>
        new(
            tile.Coord.Q,
            tile.Coord.R,
            tile.Terrain.ToWireName(),
            tile.IsCoastalWater,
            tile.Orientation.ToWireName(),
            tile.Variant);
}

/// <summary>
/// One chunk of the fog mask (map-fog-v2.md §3).
/// </summary>
/// <param name="Cu">Chunk column, <c>floor(texelU / ChunkSize)</c>.</param>
/// <param name="Cv">Chunk row, <c>floor(texelV / ChunkSize)</c>.</param>
/// <param name="Version">
/// Changes exactly when this chunk's pixels would; <c>"0"</c> for an empty
/// chunk. Lets the client skip decoding a chunk it already holds.
/// </param>
/// <param name="Png">
/// Base64 of a <c>ChunkSize</c> x <c>ChunkSize</c> RGBA8 PNG (R = unknown
/// ramp, G = out-of-sight ramp, B = noise seed — §2.2), or <c>null</c> for an
/// empty chunk: fully unknown, nothing explored and no vision source in
/// reach, so nothing is encoded or sent.
/// </param>
public sealed record FogChunkResponse(int Cu, int Cv, string Version, string? Png);

/// <summary>
/// <c>GET /worlds/{id}/fog-chunks</c>: every chunk of the requested inclusive
/// rectangle, row-major (<c>cv</c> outer, <c>cu</c> inner). JSON with
/// base64 PNGs rather than a bespoke binary framing: a chunk PNG is a few
/// hundred bytes to a few KB, the batch is a few dozen chunks, and the
/// base64 overhead is dwarfed by not needing a second parser on either side.
/// </summary>
/// <param name="ChunkSize">Texels per chunk edge; the client refuses a value it wasn't built for.</param>
public sealed record FogChunksResponse(
    int ChunkSize,
    int CuMin,
    int CuMax,
    int CvMin,
    int CvMax,
    IReadOnlyList<FogChunkResponse> Chunks)
{
    public static FogChunksResponse From(int cuMin, int cuMax, int cvMin, int cvMax, IReadOnlyList<FogChunk> chunks)
    {
        ArgumentNullException.ThrowIfNull(chunks);

        return new FogChunksResponse(
            FogChunkLayout.ChunkSize,
            cuMin,
            cuMax,
            cvMin,
            cvMax,
            [.. chunks.Select(c => new FogChunkResponse(
                c.Coord.U, c.Coord.V, c.Version, c.Png is null ? null : Convert.ToBase64String(c.Png)))]);
    }
}

public sealed record TileChunkResponse(
    Guid WorldId,
    int QMin,
    int QMax,
    int RMin,
    int RMax,
    IReadOnlyList<TileResponse> Tiles);
