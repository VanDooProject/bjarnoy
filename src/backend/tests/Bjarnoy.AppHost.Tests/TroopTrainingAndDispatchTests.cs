using System.Net.Http.Headers;
using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Issue #40's troop build-and-movement system, end to end through the real
/// frontend against the real live backend: queuing a unit in the Longhouse
/// training UI, and dispatching a garrisoned army via ArmyPanel's Move flow —
/// the two UI-heaviest, most-wired-together pieces of the troop system (see
/// the task notes: combat/siege/ships are left to the existing domain/
/// integration suites, which already cover that logic thoroughly; this is
/// about UI ↔ API ↔ DB wiring, not re-proving game rules).
/// </summary>
/// <remarks>
/// <para>
/// Both scenarios share one <see cref="DistributedApplicationTestingBuilder"/>
/// boot (Postgres + API + frontend), the same way every other test in this
/// project structures itself — one Fact, one full stack — rather than paying
/// that cost twice for two facts that would otherwise share nothing else.
/// </para>
/// <para>
/// A real Thrall's <c>TrainingDuration</c> is a fixed 10 minutes of *game*
/// time (<see cref="Bjarnoy.Domain.Units.UnitCatalogue"/>) — too slow to wait
/// out for real in a test. <c>Settlement.PlanTrain</c> now divides per-unit
/// training duration by the world's <c>SpeedFactor</c>, the same way
/// <c>PlanBuild</c> already divided build duration (previously it didn't —
/// a real inconsistency, fixed alongside this test rather than worked
/// around). This test uses the existing admin world-speed lever
/// (<c>PATCH /admin/worlds/{id}/settings</c>, the same control an admin has
/// in production for a slow-moving world) to set a very high speed factor
/// before queuing the Thrall, so the wait below is real seconds, not real
/// minutes — no test-only "are we in CI" branch in game code, per this
/// repo's CLAUDE.md; this is the same lever, used the same way, a human
/// admin already has.
/// </para>
/// <para>
/// The one legitimate shortcut this test does take is topping up the fresh
/// settlement's Iron via the existing admin god-mode grant
/// (<c>POST /admin/settlements/{id}/resources</c>, <c>AdminSettlementEndpoints</c>)
/// — a founding settlement starts with zero Iron
/// (<c>BuildingCatalogue.FoundingStock</c>) and only trickles it in at 2/hour
/// from the longhouse alone, which would make even *starting* a Thrall order
/// impractically slow to set up. Granting resources is an ordinary,
/// already-shipped admin capability (used exactly this way, through the same
/// lazy-settle path a player's own resources go through) — not something
/// invented for this test.
/// </para>
/// </remarks>
public class TroopTrainingAndDispatchTests
{
    [Fact]
    public async Task QueuingTrainingAndDispatchingAnArmyThroughTheRealFrontendWorksEndToEnd()
    {
        // Generous headroom for Aspire boot, npm/Vite cold start, and the UI
        // flow — training itself finishes in seconds once the world's speed
        // factor is bumped (see class remarks), not the real 10 minutes.
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

        // --- Admin: top up Iron so the Thrall order is affordable (see class remarks) ---
        // Same technique AdminBootstrapLoginTests uses to reach the seeded
        // admin account: the "Log in as admin" dashboard link (AppHost.cs)
        // carries the generated one-time username/password as query params,
        // which is otherwise the only way to learn them from outside the
        // AppHost process.
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

        var grantResponse = await adminHttpClient.PostAsJsonAsync(
            $"/api/v1/admin/settlements/{settlementId}/resources",
            new GrantResourcesRequest(Iron: 1000),
            cancellationToken);
        grantResponse.EnsureSuccessStatusCode();

        // --- Admin: speed the world way up so the Thrall's real 10-minute
        // training timer resolves in seconds instead (see class remarks) ---
        var speedUpResponse = await adminHttpClient.PatchAsJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: 600.0),
            cancellationToken);
        speedUpResponse.EnsureSuccessStatusCode();

        // --- Navigate into the full settlement view (Longhouse ring menu lives here, not on the landing page) ---
        await page.GotoAsync($"{frontendUrl}settlement", new PageGotoOptions { Timeout = 120_000 });
        var canvas = page.Locator("canvas");
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });

        // --- Open the Longhouse's ring menu and queue one Thrall ---
        // SettlementView centres the camera on the settlement itself here
        // (no screenBiasX, unlike the landing page's preview) — the
        // Longhouse sits at dead centre of the canvas.
        var trainUnitsBubble = page.GetByRole(AriaRole.Button, new() { Name = "Train units" });
        var ringOpened = false;
        for (var attempt = 0; attempt < 10 && !ringOpened; attempt++)
        {
            var box = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Settlement canvas never rendered a bounding box.");
            await page.Mouse.ClickAsync(box.X + box.Width / 2, box.Y + box.Height / 2);
            try
            {
                await Assertions.Expect(trainUnitsBubble).ToBeVisibleAsync(new() { Timeout = 2_000 });
                ringOpened = true;
            }
            catch (PlaywrightException)
            {
                await page.WaitForTimeoutAsync(1_000);
            }
        }
        Assert.True(ringOpened, "Clicking the Longhouse never opened its ring menu with a 'Train units' action.");

        await trainUnitsBubble.ClickAsync();

        // TrainingModal.vue: the quantity input defaults to 1, so queuing the
        // single Thrall this test needs is just clicking that row's Train
        // button — no need to touch the quantity field.
        var thrallRow = page.Locator(".unit-row").Filter(new LocatorFilterOptions { HasText = "thrall" });
        await Assertions.Expect(thrallRow).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await thrallRow.GetByRole(AriaRole.Button, new() { Name = "Train", Exact = true }).ClickAsync();

        // TrainingModal emits 'trained' on success, which SettlementView wires
        // straight to closeTrainModal — the modal disappearing is itself proof
        // world.trainUnitsLive's POST succeeded (an ApiError would instead
        // leave the modal open with errorText set).
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Train units" }))
            .Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        // --- Verify the queued order, via the UI ... ---
        var trainingQueuePanel = page.Locator(".training-queue-panel");
        await Assertions.Expect(trainingQueuePanel.Locator(".status-row-name").First)
            .ToHaveTextAsync("1× Thrall", new() { Timeout = 15_000 });
        await Assertions.Expect(trainingQueuePanel).ToContainTextAsync("0 / 1 trained");

        // --- ... and independently, via the API ---
        var settlementAfterQueue = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlementId}", cancellationToken);
        var queuedOrder = Assert.Single(settlementAfterQueue!.TrainingQueue);
        Assert.Equal("thrall", queuedOrder.Unit);
        Assert.Equal(1, queuedOrder.Count);

        // --- Wait out training (a few real seconds at 600x speed, see class remarks) ---
        SettlementResponse? settled = null;
        for (var attempt = 0; attempt < 60 && !cancellationToken.IsCancellationRequested; attempt++)
        {
            settled = await apiClient.GetFromJsonAsync<SettlementResponse>(
                $"/api/v1/settlements/{settlementId}", cancellationToken);
            if (settled!.TrainingQueue.Count == 0 && settled.Garrison.Any(g => g.Unit == "thrall" && g.Count >= 1))
            {
                break;
            }
            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
        }
        Assert.NotNull(settled);
        Assert.Empty(settled!.TrainingQueue);
        Assert.Contains(settled.Garrison, g => g.Unit == "thrall" && g.Count >= 1);

        // --- Dispatch that Thrall on a Move mission, through ArmyPanel ---
        // The frontend's own live poll (LIVE_POLL_MS, 4s) picks up the
        // completed garrison on its own; give it real headroom rather than
        // reloading the page (a reload would be a second, unrelated proof of
        // persistence — FoundingSettlementPersistenceTests already covers
        // that pattern for settlements).
        var garrisonRow = page.Locator(".garrison-row").Filter(new LocatorFilterOptions { HasText = "Thrall" });
        await Assertions.Expect(garrisonRow.Locator(".garrison-count"))
            .ToHaveTextAsync("1", new() { Timeout = 20_000 });

        await page.GetByRole(AriaRole.Button, new() { Name = "Dispatch army" }).ClickAsync();

        var unitPickerRow = page.Locator(".unit-picker-row").Filter(new LocatorFilterOptions { HasText = "Thrall" });
        await Assertions.Expect(unitPickerRow).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await unitPickerRow.Locator("input.qty").FillAsync("1");

        var instructions = page.Locator("p.instructions");
        for (var hexNumber = 1; hexNumber <= 2; hexNumber++)
        {
            var plotted = false;
            // Small, varied offsets from the canvas centre — the settlement's
            // own claimed tiles surround the Longhouse there, so these should
            // land on distinct, explored, clickable hexes regardless of the
            // exact on-screen hex size (which this test has no direct way to
            // read). Retried per offset the same way the founding click is,
            // since a miss (e.g. landing back on the Longhouse tile itself,
            // which re-opens the ring menu instead of plotting a waypoint)
            // should not fail the whole test.
            (float dx, float dy)[] offsets =
            [
                (40 * hexNumber, 0), (-40 * hexNumber, 0), (0, 40 * hexNumber),
                (30 * hexNumber, 30 * hexNumber), (-30 * hexNumber, -30 * hexNumber),
            ];
            foreach (var (dx, dy) in offsets)
            {
                var box = await canvas.BoundingBoxAsync()
                    ?? throw new InvalidOperationException("Settlement canvas never rendered a bounding box.");
                await page.Mouse.ClickAsync(box.X + box.Width / 2 + dx, box.Y + box.Height / 2 + dy);
                try
                {
                    await Assertions.Expect(instructions).ToContainTextAsync(
                        $"{hexNumber} hex", new() { Timeout = 1_500 });
                    plotted = true;
                    break;
                }
                catch (PlaywrightException)
                {
                    // Try the next offset.
                }
            }
            Assert.True(plotted, $"Never plotted waypoint #{hexNumber} on the dispatch route.");
        }

        var confirmButton = page.GetByRole(AriaRole.Button, new() { Name = "Confirm dispatch" });
        await Assertions.Expect(confirmButton).ToBeEnabledAsync(new() { Timeout = 5_000 });
        await confirmButton.ClickAsync();

        // confirmDispatch() clears dispatchDraft on success, which flips
        // ArmyPanel back to its list view — "Dispatch army" reappearing is
        // itself proof the POST succeeded (a rejection leaves the form open
        // with draft.error set instead).
        await Assertions.Expect(page.GetByRole(AriaRole.Button, new() { Name = "Dispatch army" }))
            .ToBeVisibleAsync(new() { Timeout = 15_000 });

        // --- Verify the dispatch, independently, via the API ---
        var armies = await apiClient.GetFromJsonAsync<ArmySummary[]>(
            $"/api/v1/settlements/{settlementId}/armies", cancellationToken);
        var army = Assert.Single(armies!);
        Assert.Equal("move", army.Mission);
        // AtHome/Supporting/InTransit are the only three places an army can
        // be (see ArmyResponse's own doc comment) — neither at home nor
        // supporting means it is on the road, which is what "InTransit"
        // means for a freshly dispatched Move order.
        Assert.False(army.AtHome);
        Assert.False(army.Supporting);

        Assert.Empty(consoleErrors);
    }
}
