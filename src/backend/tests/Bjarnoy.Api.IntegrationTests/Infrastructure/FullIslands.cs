using System.Net.Http.Json;
using System.Text.Json;
using Bjarnoy.Api.Contracts;

namespace Bjarnoy.TestSupport;

/// <summary>
/// An island with everything a test usually wants to know about it: the slim <c>/islands</c> entry plus its start positions and its
/// river and bog tiles, which the API serves from <c>/start-positions</c> and <c>/terrain-chunks</c>.
/// </summary>
public sealed record FullIslandResponse(
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
    IReadOnlyList<BogTileResponse> BogTiles,
    IReadOnlyList<UtgardWallResponse> UtgardWalls,
    IReadOnlyList<JotunTowerResponse> JotunTowers);

public static class FullIslands
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Reads <c>/islands</c>, <c>/start-positions</c> and every <c>/terrain-chunks</c> chunk and joins them by island id, like the frontend does.</summary>
    public static async Task<List<FullIslandResponse>> GetFullIslandsAsync(
        this HttpClient client, Guid worldId, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(client);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>($"/api/v1/worlds/{worldId}/islands", Json, cancellationToken)
            ?? throw new InvalidOperationException("No island list.");

        var starts = (await client.GetFromJsonAsync<List<IslandStartPositionsResponse>>(
            $"/api/v1/worlds/{worldId}/start-positions", Json, cancellationToken))!
            .ToDictionary(s => s.Id);

        var manifest = (await client.GetFromJsonAsync<TerrainChunkManifestResponse>(
            $"/api/v1/worlds/{worldId}/terrain-chunks", Json, cancellationToken))!;
        var terrain = new Dictionary<Guid, IslandTerrainResponse>();
        foreach (var info in manifest.Chunks)
        {
            var chunk = (await client.GetFromJsonAsync<TerrainChunkResponse>(
                $"/api/v1/worlds/{worldId}/terrain-chunks/{info.Index}", Json, cancellationToken))!;
            foreach (var island in chunk.Islands)
            {
                terrain[island.Id] = island;
            }
        }

        return [.. islands.Select(i => new FullIslandResponse(
            i.Id,
            i.Index,
            i.Name,
            i.Q,
            i.R,
            i.TileCount,
            starts.TryGetValue(i.Id, out var s) ? s.StartPositions : [],
            terrain.TryGetValue(i.Id, out var t) ? t.RiverTiles : [],
            i.Giants,
            i.Wasted,
            i.Camps,
            terrain.TryGetValue(i.Id, out var t2) ? t2.BogTiles : [],
            i.UtgardWalls,
            i.JotunTowers))];
    }
}
