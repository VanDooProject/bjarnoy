using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Regression test for an <see cref="OnboardingHappyPathTests"/> flake: on a cold stack the Reindeer Herder's ring never
/// opened after the first <see cref="LiveFrontendTestHelpers.ClickHexAsync"/> following founding. Until the first fog
/// mask arrives, LandingView shows "Lifting the fog…"
/// (<c>hud.mapStatus.revealingMap</c>, <c>MapStatusOverlay.vue</c>), which covers the whole map and takes
/// every pointer event; a slow first <c>fog-chunks</c> answer kept it up past the founding camera ease, and the raw
/// mouse click landed on the overlay. Holding that answer here makes the slow API the normal case.
/// </summary>
public class HexClickWhileMapRevealsTests(AppHostFixture fixture)
{
    [Fact]
    public async Task AHexClickRightAfterFoundingWaitsForTheRevealingMapOverlayAndOpensTheRing()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(6)).Token;

        await fixture.ResetAsync(cancellationToken);
        var app = fixture.App;
        var frontendUrl = app.GetEndpoint("frontend").ToString();
        using var apiClient = app.CreateHttpClient("api");

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        // Reduced motion and no smooth edges, as in OnboardingHappyPathTests (see its remarks).
        var page = await browser.NewPageAsync(new BrowserNewPageOptions { ReducedMotion = ReducedMotion.Reduce });
        await LiveFrontendTestHelpers.TurnSmoothEdgesOffAsync(page);

        // Every fog-chunks answer waits until the test lets it through: the first one after founding is what lifts
        // the "Lifting the fog…" overlay.
        var releaseFog = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await page.RouteAsync("**/fog-chunks**", async route =>
        {
            await releaseFog.Task;
            await route.ContinueAsync();
        });

        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(page, frontendUrl);

        var overlay = page.Locator("[data-testid=\"map-status-overlay\"][data-state=\"loading\"]");
        await Assertions.Expect(overlay).ToBeVisibleAsync(new() { Timeout = 10_000 });

        var world = Assert.Single(
            (await apiClient.GetFromJsonAsync<WorldSummaryResponse[]>("/api/v1/worlds", cancellationToken))!);
        var ownerId = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var settlement = Assert.Single((await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken))!);
        var grassTile = await LiveFrontendTestHelpers.FindGuidedBuildHexAsync(
            apiClient, world.Id, new HexCoord(settlement.Q, settlement.R), "grass", cancellationToken);

        var click = LiveFrontendTestHelpers.ClickHexAsync(page, grassTile.Q, grassTile.R);
        // While the overlay is up the click must not go out: a helper that clicks anyway is done within a few
        // round trips, well inside this window, and its click is lost on the overlay.
        var first = await Task.WhenAny(click, Task.Delay(TimeSpan.FromSeconds(3), cancellationToken));
        Assert.NotSame(click, first);
        await Assertions.Expect(overlay).ToBeVisibleAsync();

        releaseFog.SetResult();
        await click;

        var build = page.Locator(".ring-bubble", new PageLocatorOptions { HasText = "Build" }).First;
        await Assertions.Expect(build).ToBeVisibleAsync(new() { Timeout = 10_000 });
    }
}
