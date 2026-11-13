using System.Net.Http.Headers;
using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.Buildings;
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
/// the countdown panel. Issue #95's own test plan asked for more than that,
/// though: showing a countdown that never resolves is its own kind of
/// "stuck" onboarding, so this also speeds the order up (see the SpeedFactor
/// tuning below) and asserts the panel clears once construction finishes.
/// The onboarding moves on as soon as the order is queued: the checklist's
/// "Building 2" step ticks and the guidance pointer asks for the Lumberjack
/// while the Reindeer Herder is still under construction (the server sends
/// the queued building as a level-0 foundation).
/// </summary>
/// <remarks>
/// Deliberately doesn't drive the ring menu's click-to-open UI here — a
/// pixel-accurate click needs the renderer's own camera math, which isn't
/// exposed outside demo mode (see <c>main.ts</c>), so there's no reliable
/// way from here to land exactly on a given hex. (LandingView.vue also
/// refuses to open the ring at all on a hex outside <c>Settlement.ClaimRadius</c>,
/// via <c>withinBuildableRange</c> — now numerically identical to
/// <c>WorldModel.borderRadius</c>, what actually marks a tile's
/// <c>ownerId</c>, since both use the same centre-disc formula.) The ring's
/// own enabled/disabled terrain gating is covered by the demo-mode e2e suite
/// instead (<c>landing.spec.ts</c>), where that camera math *is* available.
/// </remarks>
public class LandingBuildQueueTests(AppHostFixture fixture)
{
    [Fact]
    public async Task QueuingAGuidedBuildingShowsItsConstructionCountdownOnTheLandingPage()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(6)).Token;

        await fixture.ResetAsync(cancellationToken);
        var app = fixture.App;
        var resourceNotifications = fixture.ResourceNotifications;

        var frontendUrl = app.GetEndpoint("frontend").ToString();
        using var apiClient = app.CreateHttpClient("api");

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        var page = await browser.NewPageAsync();
        var consoleErrors = page.CollectConsoleErrors();

        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(page, frontendUrl);

        var world = Assert.Single(
            (await apiClient.GetFromJsonAsync<WorldSummaryResponse[]>("/api/v1/worlds", cancellationToken))!);

        // The frontend generates and remembers its own anonymous player id
        // client-side (usePlayerStore, localStorage key "bjarnoy.playerId")
        // — it's what founding sent as the settlement's OwnerId, and the
        // same id X-Owner-Id proves ownership with. GET .../settlements is
        // fog-gated, so this has to go on the header before even the
        // just-founded settlement's own summary can be read back.
        var ownerId = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlement = Assert.Single(settlements!);

        // The nearest grass hex of the level-1 claim the backend accepts a Reindeer
        // Herder on (FindGuidedBuildHexAsync: not a river or camp hex).
        var centre = new HexCoord(settlement.Q, settlement.R);
        var grassTile = await LiveFrontendTestHelpers.FindGuidedBuildHexAsync(
            apiClient, world.Id, centre, "grass", cancellationToken);

        // --- Admin: tune the world's speed so the Reindeer Herder's level-1 build takes
        // OrderSeconds, a duration this test owns instead of inheriting from the catalogue's pacing.
        // The order has to outlast the slowest poll that can still pick it up (the 20 s budget
        // below) and the API read after it, yet resolve inside the 60 s wait for the panel to
        // clear. PlanBuild divides BuildDuration by the world's SpeedFactor when the order is
        // planned, so this is set before queuing.
        const double OrderSeconds = 40;
        var speedFactor = BuildingCatalogue.BuildTime(BuildingType.ReindeerHerder, 1).TotalSeconds / OrderSeconds;
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
            new UpdateWorldSettingsRequest { SpeedFactor = speedFactor },
            cancellationToken);
        speedUpResponse.EnsureSuccessStatusCode();

        apiClient.DefaultRequestHeaders.Remove("X-Owner-Id");
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
        var queued = await apiClient.PostAsJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("reindeerherder", grassTile.Q, grassTile.R),
            cancellationToken);
        await LiveFrontendTestHelpers.EnsureSuccessWithBodyAsync(queued, cancellationToken);

        // startHudSync()'s own LIVE_POLL_MS (4s) poll — already running on
        // the landing page since founding — is what's expected to pick this
        // up and mount BuildQueuePanel; no page reload, no extra click.
        // The panel can only show up with a poll that *starts* after the order
        // exists: the one in flight at queue time answers with the old, empty
        // queue, so the worst case is that response + one full interval + the
        // next response. On a loaded runner that took ~9 s (a 10 s budget
        // flaked); 20 s covers it and the 40 s order is still
        // running when the budget ends, so the panel can't have come and gone.
        var statusCard = page.Locator(".status-card");
        await Assertions.Expect(statusCard).ToBeVisibleAsync(new() { Timeout = 20_000 });
        await Assertions.Expect(statusCard.GetByText("Construction")).ToBeVisibleAsync();
        await Assertions.Expect(page.Locator(".status-row-time")).ToBeVisibleAsync();

        // The onboarding does not wait for the construction: while the Reindeer Herder is still being built (the
        // server sends it as a level-0 foundation) its checklist step is ticked and the pointer asks for the Lumberjack.
        await Assertions.Expect(page.GetByTestId("guidance-pointer")).ToContainTextAsync("One more");
        await Assertions.Expect(page.Locator("[data-testid=\"onboarding-checklist\"] .step").Nth(1)).ToHaveClassAsync(new System.Text.RegularExpressions.Regex(@"\bdone\b"));

        var settlementAfterQueue = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        var order = Assert.Single(settlementAfterQueue!.Queue);
        Assert.Equal("reindeerherder", order.Building);

        // Issue #95's own test plan: showing the countdown isn't the whole
        // story — the construction panel must clear itself once the order
        // completes, and the "Building 2" step stays ticked, purely from the
        // landing page's existing poll (no reload, no extra click).
        await Assertions.Expect(statusCard).ToBeHiddenAsync(new() { Timeout = 60_000 }); // rest of the 40 s order + the poll that sees it finished
        await Assertions.Expect(page.Locator("[data-testid=\"onboarding-checklist\"] .step").Nth(1)).ToHaveClassAsync(new System.Text.RegularExpressions.Regex(@"\bdone\b"));

        var settlementAfterCompletion = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        Assert.Empty(settlementAfterCompletion!.Queue);
        Assert.Contains(settlementAfterCompletion.Buildings, b => b.Type == "reindeerherder");

        Assert.Empty(consoleErrors);
    }
}
