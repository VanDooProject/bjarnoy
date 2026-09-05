using System.Net.Http.Headers;
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
/// the countdown panel. Issue #95's own test plan asked for more than that,
/// though: showing a countdown that never resolves is its own kind of
/// "stuck" onboarding, so this also speeds the order up (see the SpeedFactor
/// bump below) and asserts the panel clears and the onboarding tray's
/// "Building 2" step actually flips to "Placed" once construction finishes —
/// proving the landing page's progress genuinely moves on, not just that it
/// shows a number that counts down.
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
        // ClaimRadius 2 at level 1, so the backend accepts a Farm there.
        var centre = new HexCoord(settlement.Q, settlement.R);
        var chunk = await apiClient.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={centre.Q - 1}&qMax={centre.Q + 1}"
            + $"&rMin={centre.R - 1}&rMax={centre.R + 1}",
            cancellationToken);
        var grassTile = chunk!.Tiles.First(t =>
            t.Terrain == "grass" && centre.DistanceTo(new HexCoord(t.Q, t.R)) == 1);

        // --- Admin: speed the world way up so a real Farm's 4-minute build
        // timer (BuildingCatalogue.Producer, level 1) resolves in seconds —
        // otherwise there'd be no practical way to observe the onboarding
        // tray actually flip to "Placed" once construction finishes. Same
        // technique as TroopTrainingAndDispatchTests's own SpeedFactor bump,
        // but a much more modest factor: that test only needs the order to
        // finish quickly, while this one first asserts the order is *still
        // queued* (the countdown panel showing "Construction") before
        // waiting for it to complete — too high a factor (50 was tried
        // first) let the order finish before that first assertion's own API
        // round trip, since GetSettlementAsync lazily completes any queued
        // build that's due whenever it's read. 24s (SpeedFactor 10) leaves
        // comfortable room for that first check while still resolving well
        // inside this test's overall budget. Set before queuing: PlanBuild
        // divides the definition's BuildDuration by the world's SpeedFactor
        // at the moment the order is planned, not later.
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
            new UpdateWorldSettingsRequest(SpeedFactor: 10.0),
            cancellationToken);
        speedUpResponse.EnsureSuccessStatusCode();

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

        // Issue #95's own test plan: showing the countdown isn't the whole
        // story — the onboarding tray's "Building 2" step must actually
        // flip to "Placed" once the order completes, and the construction
        // panel must clear itself, purely from the landing page's existing
        // poll (no reload, no extra click). This is what "the progress
        // doesn't move on" would look like if it regressed: the card stays
        // up forever and the tray never advances even though the backend
        // finished the build.
        await Assertions.Expect(statusCard).ToBeHiddenAsync(new() { Timeout = 45_000 });
        await Assertions.Expect(page.Locator(".tray-item .sub").Nth(1)).ToHaveTextAsync("Placed");

        var settlementAfterCompletion = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        Assert.Empty(settlementAfterCompletion!.Queue);
        Assert.Contains(settlementAfterCompletion.Buildings, b => b.Type == "farm");

        Assert.Empty(consoleErrors);
    }
}
