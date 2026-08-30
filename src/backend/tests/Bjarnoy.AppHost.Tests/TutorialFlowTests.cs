using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Issue #91: queuing a building during the tutorial (the landing page,
/// which doubles as the village view — see LandingView.vue's own header
/// comment) gave no visible feedback in live mode, because
/// <c>BuildQueuePanel</c> was never rendered there (unlike SettlementView.vue,
/// which does). This is the regression test for that fix: it drives the real
/// tutorial flow end to end — founding, queuing two guided buildings through
/// the real <c>BuildingModal</c>, and confirming the construction status card
/// actually shows them — then waits the orders out and confirms the flow
/// still reaches <c>/settlement</c>.
/// </summary>
/// <remarks>
/// Bug 1, 2 and 4 in issue #91 are all live-mode-only and structurally
/// invisible to the demo-mode-only <c>src/frontend/e2e</c> suite (no backend,
/// no build queue, instant placement) — this lives in
/// <c>Bjarnoy.AppHost.Tests</c> instead, the same way
/// <see cref="TroopTrainingAndDispatchTests"/> covers the training queue
/// against the real backend. World speed is bumped via the same admin lever
/// that test uses (<c>PATCH /admin/worlds/{id}/settings</c>), fast enough to
/// keep this test quick but slow enough that the "still under construction"
/// assertions have a real window to observe before the order completes.
/// </remarks>
public class TutorialFlowTests
{
    [Fact]
    public async Task QueuingBuildingsDuringTheTutorialShowsTheConstructionQueueAndReachesSettlement()
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

        // --- Found the starting settlement (shared helper — see its own doc comment) ---
        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(page, frontendUrl);

        var world = Assert.Single(
            (await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken))!);
        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlementId = Assert.Single(settlements!).Id;

        // --- Admin: speed the world up so the two build orders below resolve
        // in seconds instead of their real duration (same technique/reasoning
        // as TroopTrainingAndDispatchTests) ---
        var frontendEvent = await resourceNotifications.WaitForResourceAsync(
            "frontend",
            evt => evt.Snapshot.Urls.Any(u => u.DisplayProperties?.DisplayName == "Log in as admin"),
            cancellationToken);
        var adminLoginUrl = frontendEvent.Snapshot.Urls
            .First(u => u.DisplayProperties?.DisplayName == "Log in as admin").Url;
        var adminQuery = new Uri(adminLoginUrl).Query.TrimStart('?')
            .Split('&')
            .Select(pair => pair.Split('=', 2))
            .ToDictionary(pair => pair[0], pair => Uri.UnescapeDataString(pair[1]));

        using var adminHttpClient = app.CreateHttpClient("api");
        var adminLogin = await adminHttpClient.PostAsJsonAsync(
            "/api/v1/auth/login",
            new LoginRequest(adminQuery["username"], adminQuery["password"]),
            cancellationToken);
        adminLogin.EnsureSuccessStatusCode();
        var adminAuth = (await adminLogin.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken))!;
        adminHttpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", adminAuth.AccessToken);

        var speedUpResponse = await adminHttpClient.PatchAsJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: 20.0),
            cancellationToken);
        speedUpResponse.EnsureSuccessStatusCode();

        // --- Queue the two guided onboarding buildings, through the real
        // BuildingModal on the landing page (still there after founding —
        // FoundStartingSettlementAsync never navigates away) ---
        var canvas = page.Locator("canvas");
        var buildHereButton = page.GetByRole(AriaRole.Button, new() { Name = "Build here" });
        var queuedSoFar = 0;
        for (var target = 1; target <= 2 && queuedSoFar < 2; target++)
        {
            var queued = false;
            // Varied small offsets from the (biased) camera centre, same
            // retry-across-offsets technique TroopTrainingAndDispatchTests
            // uses to plot dispatch waypoints — the exact on-screen hex size
            // isn't something this test can read directly, and a click can
            // land on the Longhouse itself, open water, or outside the
            // border instead of empty claimed grass.
            (float dx, float dy)[] offsets =
            [
                (60, 0), (-60, 0), (0, 60), (0, -60),
                (45, 45), (-45, -45), (45, -45), (-45, 45),
                (90, 0), (-90, 0), (0, 90),
            ];
            foreach (var (dx, dy) in offsets)
            {
                var box = await canvas.BoundingBoxAsync()
                    ?? throw new InvalidOperationException("Landing page canvas never rendered a bounding box.");
                await page.Mouse.ClickAsync(box.X + box.Width / 2 + dx, box.Y + box.Height / 2 + dy);
                try
                {
                    await Assertions.Expect(buildHereButton).ToBeVisibleAsync(new() { Timeout = 1_500 });
                    await buildHereButton.ClickAsync();
                    // BuildingModal closes once world.queueBuildLive's POST
                    // resolves (LandingView.vue's build()) — proof the order
                    // was actually accepted, not just that the button exists.
                    await Assertions.Expect(buildHereButton).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });
                    queued = true;
                    queuedSoFar++;
                    break;
                }
                catch (PlaywrightException)
                {
                    // Either nothing opened (missed hex) or this hex isn't
                    // buildable (water/outside border/already occupied) —
                    // close whatever's open and try the next offset.
                    var closeButton = page.Locator(".modal button.close");
                    if (await closeButton.IsVisibleAsync())
                    {
                        await closeButton.ClickAsync();
                    }
                }
            }
            Assert.True(queued, $"Never managed to queue building #{target} through the real BuildingModal.");
        }

        // --- This is the actual regression assertion: the construction
        // status card must show both queued orders on the landing page
        // itself, not just silently accept the click (issue #91's bug) ---
        var statusCard = page.Locator(".status-card");
        await Assertions.Expect(statusCard).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(statusCard.Locator(".status-row")).ToHaveCountAsync(2, new() { Timeout = 10_000 });
        await Assertions.Expect(statusCard).ToContainTextAsync("Crop farm", new() { Timeout = 5_000 });

        // --- Independently, via the API: both orders are really queued ---
        var settlementAfterQueue = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", cancellationToken);
        Assert.Equal(2, settlementAfterQueue!.Queue.Count);
        Assert.All(settlementAfterQueue.Queue, o => Assert.Equal("farm", o.Building));

        // --- Wait out both orders (fast at 20x speed, see remarks) ---
        SettlementResponse? settled = null;
        for (var attempt = 0; attempt < 60 && !cancellationToken.IsCancellationRequested; attempt++)
        {
            settled = await apiClient.GetFromJsonAsync<SettlementResponse>(
                $"/api/v1/settlements/{settlementId}", cancellationToken);
            if (settled!.Queue.Count == 0 && settled.Buildings.Count(b => b.Type == "farm") == 2)
            {
                break;
            }
            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
        }
        Assert.NotNull(settled);
        Assert.Empty(settled!.Queue);
        Assert.Equal(2, settled.Buildings.Count(b => b.Type == "farm"));

        // --- The frontend's own live poll (LIVE_POLL_MS, 4s) picks up
        // completion on its own; give it real headroom rather than reloading
        // (a reload would just re-prove persistence, which
        // FoundingSettlementPersistenceTests already covers) ---
        var traySecondItem = page.Locator(".tray-item .sub").Nth(2);
        await Assertions.Expect(traySecondItem).ToHaveTextAsync("Placed", new() { Timeout = 20_000 });

        // --- Onboarding complete: the nickname prompt appears, and
        // dismissing it lands on /settlement (LandingView.vue's closePrompt) ---
        await Assertions.Expect(page.GetByText("Landfall made.")).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await page.Locator("button.skip").ClickAsync();
        // A Vue Router client-side route change (History API), not a full
        // page navigation — WaitForURLAsync waits for a navigation event and
        // never fires for it (see AdminBootstrapLoginTests's own comment on
        // this exact gotcha); ToHaveURLAsync polls the current URL instead.
        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex("/settlement"), new PageAssertionsToHaveURLOptions { Timeout = 15_000 });

        Assert.Empty(consoleErrors);
    }
}
