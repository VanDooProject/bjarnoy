using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Regression coverage: the landing page's guided onboarding build step
/// queued a building against the real backend (<c>queueBuildLive</c>) but
/// never showed the same construction countdown <c>BuildQueuePanel</c> gives
/// the full settlement view — the player had no way to see the order was
/// actually in progress. Drives the real onboarding flow (found, then pick a
/// guided building through the ring menu) and asserts the countdown panel
/// appears, backed by a real queued <see cref="BuildOrderResponse"/> the
/// backend persisted.
/// </summary>
public class LandingBuildQueueTests
{
    [Fact]
    public async Task PickingAGuidedBuildingOnTheLandingPageShowsItsConstructionCountdown()
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

        var worlds = await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken);
        var world = Assert.Single(worlds!);
        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlementId = Assert.Single(settlements!).Id;

        var canvas = page.Locator("canvas");
        var box = await canvas.BoundingBoxAsync()
            ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
        var centerX = box.X + box.Width / 2f;
        var centerY = box.Y + box.Height / 2f;

        // The post-founding camera re-centres on the settlement over
        // HexMapRenderer's CAMERA_TRANSITION_MS (1400ms) — wait for it to
        // settle rather than racing it.
        await page.WaitForTimeoutAsync(1800);

        // A guessed pixel offset only happens to land on a real hex at one
        // particular zoom/camera framing (the border here is small — a
        // fresh level-1 realm), and the frontend's own border render radius
        // is currently a hex or two more generous than the backend's actual
        // claim radius at level 1 — a click that looks like "your border" on
        // screen can still be refused by queueBuildLive as outside it. So
        // this doesn't stop at the first offset that opens a ring: it tries
        // each in turn, actually queuing the enabled guided building and
        // only accepting one where the countdown panel really shows up.
        var ringBubbles = page.Locator(".ring-bubble");
        var statusCard = page.Locator(".status-card");
        string? queuedBuildingType = null;

        foreach (var (dx, dy) in new (float, float)[]
                 {
                     (30, 0), (-30, 0), (0, 30), (0, -30),
                     (21, 21), (-21, -21), (21, -21), (-21, 21),
                     (42, 0), (-42, 0), (0, 42), (0, -42),
                     (55, 0), (-55, 0), (0, 55), (0, -55),
                 })
        {
            // Closes any ring left open by a previous failed attempt (a
            // click anywhere on the canvas while a ring is open lands on its
            // full-screen backdrop, not a new hex — see RingMenu's own
            // `outsidePointerDown`) before opening the next candidate.
            await page.Mouse.ClickAsync(centerX, centerY);
            await page.Mouse.ClickAsync(centerX + dx, centerY + dy);
            if (await ringBubbles.CountAsync() == 0)
            {
                continue;
            }

            var farmBubble = page.Locator(".ring-bubble", new PageLocatorOptions { HasText = "Farm" });
            var lumberjackBubble = page.Locator(".ring-bubble", new PageLocatorOptions { HasText = "Lumberjack" });
            if (await farmBubble.CountAsync() == 0 || await lumberjackBubble.CountAsync() == 0)
            {
                continue;
            }

            // Only the guided type matching the clicked tile's own terrain
            // is enabled (Farm needs grass, Lumberjack needs forest) —
            // exactly one of the two should be clickable; the other is
            // disabled and a no-op.
            var farmEnabled = await farmBubble.IsEnabledAsync();
            var lumberjackEnabled = await lumberjackBubble.IsEnabledAsync();
            if (farmEnabled == lumberjackEnabled)
            {
                continue;
            }

            var (enabledBubble, buildingType) = farmEnabled ? (farmBubble, "farm") : (lumberjackBubble, "lumberjack");
            await enabledBubble.ClickAsync();

            try
            {
                await Assertions.Expect(statusCard).ToBeVisibleAsync(new() { Timeout = 3_000 });
                queuedBuildingType = buildingType;
                break;
            }
            catch (PlaywrightException)
            {
                // Refused (most likely outside the backend's actual claim
                // radius) — try the next candidate.
            }
        }

        Assert.True(
            queuedBuildingType is not null,
            "No candidate hex around the settlement centre both opened the ring and actually queued a guided building.");

        // BuildQueuePanel's own "Construction" status card, with a real
        // countdown — the thing this test exists to prove now appears here.
        await Assertions.Expect(statusCard.GetByText("Construction")).ToBeVisibleAsync();
        await Assertions.Expect(page.Locator(".status-row-time")).ToBeVisibleAsync();

        var settlement = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", cancellationToken);
        var order = Assert.Single(settlement!.Queue);
        Assert.Equal(queuedBuildingType, order.Building);

        Assert.Empty(consoleErrors);
    }
}
