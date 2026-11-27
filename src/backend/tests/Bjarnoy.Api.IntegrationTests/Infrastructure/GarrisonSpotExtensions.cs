using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>Garrison-spot helpers for tests that dispatch from, or adjust, a settlement: its longhouse hex is the spot land units stand at.</summary>
internal static class GarrisonSpotExtensions
{
    /// <summary>The settlement's longhouse hex, where land units stand.</summary>
    public static HexPointRequest Spot(this SettlementResponse settlement) => new(settlement.Q, settlement.R);

    /// <summary>The longhouse hex of <paramref name="settlementId"/>, read through the API as the signed-in owner.</summary>
    public static async Task<HexPointRequest> SpotOfAsync(this HttpClient client, Guid settlementId, CancellationToken cancellationToken)
    {
        var settlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", SqliteApiFixture.StrictJson, cancellationToken);
        return settlement!.Spot();
    }
}
