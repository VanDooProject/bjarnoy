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
/// The full onboarding happy path, driven against a REAL backend — the
/// companion to the demo Playwright suite's
/// <c>e2e/onboarding-happy-path.spec.ts</c>. Landfall, both guided buildings
/// through the real ring menu (not <c>POST .../builds</c> directly, unlike
/// <see cref="LandingOnboardingCompletionTests"/> — see
/// <see cref="LiveFrontendTestHelpers.ClickHexAsync"/>), the completion
/// hand-off, the profile nudge into a real <c>/register</c> form, a real
/// account claiming the settlement, logging out via the account menu, the
/// returning-login gate, and logging back in.
/// </summary>
/// <remarks>
/// This is the one leg the demo spec cannot cover at all: demo mode's
/// <c>WorldModel</c> is pure in-memory (see <c>stores/player.ts</c>'s own
/// remarks), so a full reload after logout has nothing server-side to
/// restore a realm from, even once the login itself succeeds. Here, logging
/// back in genuinely gets the same settlement back — proven both by the
/// frontend landing on <c>/settlement</c> again and by an independent API
/// check (<c>GET /worlds/{id}/membership</c>, resolved off the JWT via
/// <c>CallerRealmResolver</c>, with a *different* <c>X-Owner-Id</c> than the
/// founding browser's own — proving the JWT, not the header, is what found
/// it).
/// </remarks>
public class OnboardingHappyPathTests
{
    [Fact]
    public async Task TheFullOnboardingHappyPathEndsWithTheSameRealmAfterALogoutLoginRoundTrip()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(8)).Token;

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

        var founderOwnerId = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");

        // Another in-flight PR requires the owner's X-Owner-Id/JWT on
        // GET /worlds/{id}/settlements and GET /settlements/{id} — send it
        // from the start (like LandingOnboardingCompletionTests does for
        // builds) so this test works both before and after that lands.
        apiClient.DefaultRequestHeaders.Remove("X-Owner-Id");
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", founderOwnerId);

        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlement = Assert.Single(settlements!);

        // The two guided buildings the tray tracks (farm, lumberjack — see
        // LandingView.vue's GUIDED_BUILD_TERRAIN) each need their own
        // terrain, both guaranteed adjacent to any start position (see
        // LandingBuildQueueTests's own comment on WorldGenerator's
        // guarantee) and so within ClaimRadius 2 at level 1.
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
        // same technique/tuning as LandingOnboardingCompletionTests's own bump.
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
            new UpdateWorldSettingsRequest { SpeedFactor = 10.0 },
            cancellationToken);
        speedUpResponse.EnsureSuccessStatusCode();

        // --- Guided build 1: Farm on the grass hex, via the REAL ring menu -----
        await LiveFrontendTestHelpers.ClickHexAsync(page, grassTile.Q, grassTile.R);
        var farmBubble = page.Locator(".ring-bubble", new PageLocatorOptions { HasText = "Farm" });
        await Assertions.Expect(farmBubble).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await farmBubble.ClickAsync();

        // --- Guided build 2: Lumberjack on the forest hex, via the ring menu ---
        await LiveFrontendTestHelpers.ClickHexAsync(page, forestTile.Q, forestTile.R);
        var lumberjackBubble = page.Locator(".ring-bubble", new PageLocatorOptions { HasText = "Lumberjack" });
        await Assertions.Expect(lumberjackBubble).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await lumberjackBubble.ClickAsync();

        // Both queued against the real backend; startHudSync()'s poll picks
        // them up with no reload/click once the sped-up world resolves them
        // — same wait pattern (and the same reasoning for why there's no
        // reliable frame to catch an individual row) as
        // LandingOnboardingCompletionTests.
        var statusCard = page.Locator(".status-card");
        await Assertions.Expect(statusCard).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(statusCard).ToBeHiddenAsync(new() { Timeout = 45_000 });

        var settlementAfterCompletion = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        Assert.Contains(settlementAfterCompletion!.Buildings, b => b.Type == "farm");
        Assert.Contains(settlementAfterCompletion.Buildings, b => b.Type == "lumberjack");

        var completionBanner = page.GetByTestId("onboarding-banner");
        await Assertions.Expect(completionBanner).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await page.GetByTestId("onboarding-continue").ClickAsync();
        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex(@"/settlement$"), new PageAssertionsToHaveURLOptions { Timeout = 10_000 });

        // --- Profile nudge -> a real /register form -----------------------------
        var profileNudgeCta = page.GetByTestId("profile-nudge-cta");
        await Assertions.Expect(profileNudgeCta).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await profileNudgeCta.ClickAsync();
        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex(@"/register$"), new PageAssertionsToHaveURLOptions { Timeout = 10_000 });

        var userName = $"e2ejarl{Guid.NewGuid():N}"[..24];
        const string password = "correct horse battery staple";
        await page.GetByLabel("Username").FillAsync(userName);
        await page.GetByLabel("Password", new PageGetByLabelOptions { Exact = true }).FillAsync(password);
        await page.GetByLabel("Confirm password").FillAsync(password);
        await page.GetByRole(AriaRole.Button, new PageGetByRoleOptions { Name = "Create account" }).ClickAsync();

        // RegisterView's own redirect defaults to '/' (ProfileNudge's "Name
        // your jarl" carries no `?redirect=`), but router/index.ts's own
        // guard immediately bounces a `to.name === 'landing'` navigation to
        // `{ name: 'settlement' }` once `hasFoundedSettlement &&
        // onboardingComplete` — both true here — so this lands on
        // /settlement, not bare '/'. Same real, verified behaviour the demo
        // spec's own comment documents (an earlier draft of that spec
        // asserted '/' from reading RegisterView.vue alone and failed
        // against this guard).
        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex(@"/settlement$"), new PageAssertionsToHaveURLOptions { Timeout = 10_000 });

        var accountMenuTrigger = page.GetByTestId("account-menu-trigger");
        await Assertions.Expect(accountMenuTrigger).ToBeVisibleAsync(new() { Timeout = 10_000 });

        // --- Verify via the API that the settlement's UserId is now claimed ----
        var claimedLogin = await apiClient.PostAsJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, password), cancellationToken);
        claimedLogin.EnsureSuccessStatusCode();
        var claimedAuth = (await claimedLogin.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken))!;

        using var claimedHttpClient = app.CreateHttpClient("api");
        claimedHttpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", claimedAuth.AccessToken);
        // A DIFFERENT X-Owner-Id than the founding browser's own — proves the
        // JWT, not the header, is what resolves the realm now that it is
        // claimed (CallerRealmResolver.ResolveAsync's own remarks: "a claimed
        // player's JWT finds their realm even from a browser that never
        // founded anything").
        claimedHttpClient.DefaultRequestHeaders.Add("X-Owner-Id", $"player_{Guid.NewGuid()}");
        var membershipAfterClaim = await claimedHttpClient.GetFromJsonAsync<WorldMembershipResponse>(
            $"/api/v1/worlds/{world.Id}/membership", cancellationToken);
        Assert.Equal(settlement.Id.ToString(), membershipAfterClaim!.SettlementId);

        // --- Log out via the account menu ---------------------------------------
        await accountMenuTrigger.ClickAsync();
        await Assertions.Expect(page.GetByTestId("account-menu")).ToBeVisibleAsync(new() { Timeout = 5_000 });
        await page.GetByTestId("account-menu-logout").ClickAsync();

        // useLogout ends in a full page reload to '/' (window.location.assign),
        // not an in-app navigation — wait for what it shows next rather than
        // a URL change (the path doesn't change).
        var returningLoginPanel = page.GetByTestId("returning-login-panel");
        await Assertions.Expect(returningLoginPanel).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await Assertions.Expect(page.GetByText(new Regex("put your longhouse somewhere", RegexOptions.IgnoreCase)))
            .Not.ToBeVisibleAsync();

        var playerIdAfterLogout = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");
        Assert.NotEmpty(playerIdAfterLogout);
        Assert.NotEqual(founderOwnerId, playerIdAfterLogout);

        // --- Log back in via the returning-login gate ---------------------------
        await page.GetByTestId("returning-login-password").FillAsync(password);
        await page.GetByTestId("returning-login-submit").ClickAsync();

        // Login restores the realm via world.joinWorld -> GET .../membership,
        // resolved off the JWT (CallerRealmResolver) rather than this fresh
        // browser's own (unrelated) local id — then the router guard bounces
        // '/' straight to '/settlement'. This round trip through a real
        // backend is the whole point of this test over the demo suite's own
        // version, which cannot get past this step (no backend to restore
        // a realm from — see that spec's own comment).
        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex(@"/settlement$"), new PageAssertionsToHaveURLOptions { Timeout = 15_000 });
        await Assertions.Expect(returningLoginPanel).Not.ToBeVisibleAsync();
        await Assertions.Expect(accountMenuTrigger).ToBeVisibleAsync(new() { Timeout = 10_000 });

        var membershipAfterRelogin = await claimedHttpClient.GetFromJsonAsync<WorldMembershipResponse>(
            $"/api/v1/worlds/{world.Id}/membership", cancellationToken);
        Assert.Equal(settlement.Id.ToString(), membershipAfterRelogin!.SettlementId);

        Assert.Empty(consoleErrors);
    }
}
