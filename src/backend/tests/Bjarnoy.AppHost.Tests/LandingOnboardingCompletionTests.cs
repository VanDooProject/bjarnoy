using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Issue #95's own test plan asked for the full happy path, not just one
/// guided building's countdown (that's <see cref="LandingBuildQueueTests"/>):
/// found the starting settlement, complete *both* guided buildings, and
/// confirm the landing page actually hands off — the onboarding tray clears,
/// the game routes to <c>/settlement</c>, and the nickname prompt is shown
/// along the way. Regression coverage for a "stuck" onboarding where the
/// tray's progress moves but the handoff itself never fires.
/// </summary>
/// <remarks>
/// Same reasoning as <see cref="LandingBuildQueueTests"/> for not driving the
/// ring menu's click-to-open UI here — queues both orders directly against
/// <c>POST /settlements/{id}/builds</c>, the same request
/// <c>queueBuildLive</c> sends, rather than a pixel-accurate click the
/// backend's real claim radius at level 1 (<c>Settlement.ClaimRadius</c>)
/// might reject depending on exactly where it lands.
/// </remarks>
public class LandingOnboardingCompletionTests
{
    [Fact]
    public async Task CompletingBothGuidedBuildingsHandsOffToSettlementWithANicknamePrompt()
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

        var ownerId = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");

        // The two guided buildings the tray tracks (farm, lumberjack — see
        // LandingView.vue's GUIDED_BUILD_TERRAIN) each need their own
        // terrain, both guaranteed adjacent to any start position (see
        // LandingBuildQueueTests's own comment on WorldGenerator's
        // guarantee) and so within ClaimRadius 1 at level 1.
        var centre = new HexCoord(settlement.Q, settlement.R);
        var chunk = await apiClient.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={centre.Q - 1}&qMax={centre.Q + 1}"
            + $"&rMin={centre.R - 1}&rMax={centre.R + 1}",
            cancellationToken);
        var grassTile = chunk!.Tiles.First(t =>
            t.Terrain == "grass" && centre.DistanceTo(new HexCoord(t.Q, t.R)) == 1);
        var forestTile = chunk!.Tiles.First(t =>
            t.Terrain == "forest" && centre.DistanceTo(new HexCoord(t.Q, t.R)) == 1);

        // --- Admin: speed the world up so both builds resolve quickly —
        // same technique/tuning as LandingBuildQueueTests's own bump (see its
        // comment for why 10x rather than a much larger factor).
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

        var queuedFarm = await apiClient.PostAsJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("farm", grassTile.Q, grassTile.R),
            cancellationToken);
        queuedFarm.EnsureSuccessStatusCode();

        var queuedLumberjack = await apiClient.PostAsJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("lumberjack", forestTile.Q, forestTile.R),
            cancellationToken);
        queuedLumberjack.EnsureSuccessStatusCode();

        // startHudSync()'s poll (already running since founding) picks both
        // orders up with no reload/click; once they complete the onboarding
        // tray's two guided-building rows both flip to "Placed" and the
        // construction card clears.
        var statusCard = page.Locator(".status-card");
        await Assertions.Expect(statusCard).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(statusCard).ToBeHiddenAsync(new() { Timeout = 45_000 });
        await Assertions.Expect(page.Locator(".tray-item .sub").Nth(1)).ToHaveTextAsync("Placed");
        await Assertions.Expect(page.Locator(".tray-item .sub").Nth(2)).ToHaveTextAsync("Placed");

        var settlementAfterCompletion = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        Assert.Empty(settlementAfterCompletion!.Queue);
        Assert.Contains(settlementAfterCompletion.Buildings, b => b.Type == "farm");
        Assert.Contains(settlementAfterCompletion.Buildings, b => b.Type == "lumberjack");

        // Onboarding is complete (ONBOARDING_TARGET_BUILDINGS = longhouse +
        // 2) the moment both rows flip — the nickname prompt is what asks
        // for a username before the game hands off to /settlement.
        var nicknamePrompt = page.Locator(".prompt");
        await Assertions.Expect(nicknamePrompt).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(nicknamePrompt.GetByPlaceholder("Your jarl's name")).ToBeVisibleAsync();

        await nicknamePrompt.GetByRole(AriaRole.Button, new() { Name = "Skip for now" }).ClickAsync();

        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex(@"/settlement$"), new PageAssertionsToHaveURLOptions { Timeout = 10_000 });

        Assert.Empty(consoleErrors);
    }
}
