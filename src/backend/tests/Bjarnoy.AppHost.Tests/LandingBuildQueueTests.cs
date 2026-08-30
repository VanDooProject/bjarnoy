using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Regression coverage: the landing page's guided onboarding build step
/// queued a building against the real backend (<c>queueBuildLive</c>) but
/// never showed the same construction countdown <c>BuildQueuePanel</c> gives
/// the full settlement view — the player had no way to see the order was
/// actually in progress. Founds the starting settlement through the real UI,
/// then queues a building the same way the ring menu's <c>onRingSelect</c>
/// does (a direct <c>POST /settlements/{id}/builds</c>, the same request
/// <c>queueBuildLive</c> sends) and asserts the landing page's own poll
/// (<c>startHudSync</c>'s <c>LIVE_POLL_MS</c> interval) picks it up and shows
/// the countdown panel.
/// </summary>
/// <remarks>
/// Deliberately doesn't drive the ring menu's click-to-open UI here — a
/// clicked hex only reliably lands inside the frontend's own rendered
/// border, which (<c>WorldModel.borderRadius</c>) is currently a hex or two
/// more generous than the backend's actual claim radius
/// (<c>Settlement.ClaimRadius</c>) at level 1, so a pixel-accurate click
/// without the renderer's own camera math (not exposed outside demo mode —
/// see <c>main.ts</c>) can't reliably target a hex the backend will actually
/// accept. The ring's own enabled/disabled terrain gating is covered by the
/// demo-mode e2e suite instead (<c>landing.spec.ts</c>), where that camera
/// math *is* available.
/// </remarks>
public class LandingBuildQueueTests
{
    [Fact]
    public async Task QueuingAGuidedBuildingShowsItsConstructionCountdownOnTheLandingPage()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(6)).Token;

        var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Bjarnoy_AppHost>(cancellationToken);
        appHost.Services.ConfigureHttpClientDefaults(clientBuilder => clientBuilder.AddStandardResilienceHandler());

        await using var app = await appHost.BuildAsync(cancellationToken);
        await app.StartAsync(cancellationToken);

        var resourceNotifications = app.Services.GetRequiredService<ResourceNotificationService>();
        await resourceNotifications.WaitForResourceHealthyAsync("api", cancellationToken);
        await resourceNotifications.WaitForResourceHealthyAsync("frontend", cancellationToken);

        var frontendUrl = app.GetEndpoint("frontend").ToString();
        using var apiClient = app.CreateHttpClient("api");

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        var page = await browser.NewPageAsync();
        var consoleErrors = page.CollectConsoleErrors();

        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(page, frontendUrl);

        var world = Assert.Single(
            (await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken))!);
        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlement = Assert.Single(settlements!);

        // The frontend generates and remembers its own anonymous player id
        // client-side (usePlayerStore, localStorage key "bjarnoy.playerId")
        // — it's what founding sent as the settlement's OwnerId, and the
        // same id X-Owner-Id proves ownership with.
        var ownerId = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");

        // A grass neighbour of the settlement's own centre — guaranteed to
        // exist (WorldGenerator only picks a start position with at least
        // one adjacent forest and two more adjacent grass hexes) and within
        // ClaimRadius 1 at level 1, so the backend accepts a Farm there.
        var centre = new HexCoord(settlement.Q, settlement.R);
        var chunk = await apiClient.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={centre.Q - 1}&qMax={centre.Q + 1}"
            + $"&rMin={centre.R - 1}&rMax={centre.R + 1}",
            cancellationToken);
        var grassTile = chunk!.Tiles.Single(t =>
            t.Terrain == "grass" && centre.DistanceTo(new HexCoord(t.Q, t.R)) == 1);

        apiClient.DefaultRequestHeaders.Remove("X-Owner-Id");
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var queued = await apiClient.PostAsJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("farm", grassTile.Q, grassTile.R),
            cancellationToken);
        queued.EnsureSuccessStatusCode();

        // startHudSync()'s own LIVE_POLL_MS (4s) poll — already running on
        // the landing page since founding — is what's expected to pick this
        // up and mount BuildQueuePanel; no page reload, no extra click.
        var statusCard = page.Locator(".status-card");
        await Assertions.Expect(statusCard).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(statusCard.GetByText("Construction")).ToBeVisibleAsync();
        await Assertions.Expect(page.Locator(".status-row-time")).ToBeVisibleAsync();

        var settlementAfterQueue = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        var order = Assert.Single(settlementAfterQueue!.Queue);
        Assert.Equal("farm", order.Building);

        Assert.Empty(consoleErrors);
    }
}
