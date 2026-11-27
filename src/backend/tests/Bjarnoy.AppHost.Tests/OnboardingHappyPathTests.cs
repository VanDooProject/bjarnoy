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
public class OnboardingHappyPathTests(AppHostFixture fixture)
{
    [Fact]
    public async Task TheFullOnboardingHappyPathEndsWithTheSameRealmAfterALogoutLoginRoundTrip()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(8)).Token;

        await fixture.ResetAsync(cancellationToken);
        var app = fixture.App;
        var resourceNotifications = fixture.ResourceNotifications;

        var frontendUrl = app.GetEndpoint("frontend").ToString();
        using var apiClient = app.CreateHttpClient("api");

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        // Reduced motion, same as the demo suite's playwright.config.ts: the
        // profile nudge bobs on an infinite keyframe animation (paired with a
        // prefers-reduced-motion override in ProfileNudge.vue), and a
        // constantly moving element never passes Playwright's "stable" click
        // check. Emulating the media feature stills it without touching app
        // code or the DOM under test.
        var page = await browser.NewPageAsync(new BrowserNewPageOptions { ReducedMotion = ReducedMotion.Reduce });
        await LiveFrontendTestHelpers.TurnSmoothEdgesOffAsync(page);
        var consoleErrors = page.CollectConsoleErrors();

        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(page, frontendUrl);

        var world = Assert.Single(
            (await apiClient.GetFromJsonAsync<WorldSummaryResponse[]>("/api/v1/worlds", cancellationToken))!);

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

        // The two guided buildings the tray tracks (reindeerherder, lumberjack — see
        // LandingView.vue's GUIDED_BUILD_TERRAIN), each on the nearest hex of its terrain
        // in the level-1 claim that the backend accepts (FindGuidedBuildHexAsync: not a
        // river or camp hex).
        var centre = new HexCoord(settlement.Q, settlement.R);
        var grassTile = await LiveFrontendTestHelpers.FindGuidedBuildHexAsync(
            apiClient, world.Id, centre, "grass", cancellationToken);
        var forestTile = await LiveFrontendTestHelpers.FindGuidedBuildHexAsync(
            apiClient, world.Id, centre, "forest", cancellationToken);

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

        // --- Guided build 1: Reindeer Herder on the grass hex, via the REAL ring menu -----
        // The ring returns once its last bubble is clicked; each order counts as queued only once the server answered.
        var buildsPath = $"/api/v1/settlements/{settlement.Id}/builds";
        Task<IResponse> BuildQueuedAsync() => page.WaitForResponseAsync(
            response => response.Request.Method == "POST" && response.Url.EndsWith(buildsPath),
            new PageWaitForResponseOptions { Timeout = 45_000 });

        await LiveFrontendTestHelpers.ClickHexAsync(page, grassTile.Q, grassTile.R);
        var herderQueued = BuildQueuedAsync();
        await LiveFrontendTestHelpers.BuildThroughRingAsync(page, "Resource", "Reindeer Herder");
        var herderResponse = await herderQueued;
        Assert.True(herderResponse.Ok, $"Queueing the Reindeer Herder answered {herderResponse.Status}.");

        // --- Guided build 2: Lumberjack on the forest hex, via the ring menu ---
        // On CI's software renderer the ring's layer swaps take seconds each, so the sped-up Reindeer Herder
        // (~6 s) can be standing, and the HUD's poll can have cleared its row, before the Lumberjack's order even
        // reaches the server. The construction card then hides in the gap between the two orders, so waiting for
        // it to hide proves nothing about the Lumberjack: the test used to read the settlement before that order
        // was in. Hold the Lumberjack's request until exactly that has happened, so the worst case runs every
        // time, not only on a slow runner.
        var statusCard = page.Locator(".status-card");
        var buildsRoute = $"**{buildsPath}";
        await page.RouteAsync(buildsRoute, async route =>
        {
            await WaitForStandingBuildingAsync(apiClient, settlement.Id, "reindeerherder", cancellationToken);
            await Assertions.Expect(statusCard).ToBeHiddenAsync(new() { Timeout = 30_000 });
            await route.ContinueAsync();
        });
        await LiveFrontendTestHelpers.ClickHexAsync(page, forestTile.Q, forestTile.R);
        var lumberjackQueued = BuildQueuedAsync();
        await LiveFrontendTestHelpers.BuildThroughRingAsync(page, null, "Lumberjack");
        var lumberjackResponse = await lumberjackQueued;
        Assert.True(lumberjackResponse.Ok, $"Queueing the Lumberjack answered {lumberjackResponse.Status}.");
        await page.UnrouteAsync(buildsRoute);

        // Both orders are on the server now; once the Lumberjack stands, startHudSync()'s poll has to clear the
        // construction card with no reload or click.
        await WaitForStandingBuildingAsync(apiClient, settlement.Id, "lumberjack", cancellationToken);
        await Assertions.Expect(statusCard).ToBeHiddenAsync(new() { Timeout = 45_000 });

        var settlementAfterCompletion = await apiClient.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", cancellationToken);
        Assert.Contains(settlementAfterCompletion!.Buildings, b => b.Type == "reindeerherder");
        Assert.Contains(settlementAfterCompletion.Buildings, b => b.Type == "lumberjack");

        // --- Profile nudge -> a real /register form -----------------------------
        // Onboarding complete: the "Name your jarl" nudge is the one call to
        // action on the landing page — the completion banner waits until it
        // is answered — so registration starts straight from here.
        var profileNudgeCta = page.GetByTestId("profile-nudge-cta");
        await Assertions.Expect(profileNudgeCta).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(page.GetByTestId("onboarding-banner")).ToHaveCountAsync(0);
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
            new Regex(@"/settlement(#q=[^#]*)?$"), new PageAssertionsToHaveURLOptions { Timeout = 10_000 });

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
        // Hold POST /auth/logout longer than the live polls' intervals
        // (world.ts's ARMY_POLL_MS 2 s / LIVE_POLL_MS 4 s), so the polls that
        // fire while logging out always run, not only when the round trip
        // happens to be slow. They still read a claimed realm, which only
        // answers to the account's JWT: logging out must not drop that token
        // from the running page before the full reload replaces it, or each
        // of them comes back 403 and shows up as a "Failed to load resource"
        // console error below — the race this test used to hit only now and
        // then.
        await page.RouteAsync("**/api/v1/auth/logout", async route =>
        {
            await Task.Delay(TimeSpan.FromSeconds(5));
            await route.ContinueAsync();
        });
        await accountMenuTrigger.ClickAsync();
        await Assertions.Expect(page.GetByTestId("account-menu")).ToBeVisibleAsync(new() { Timeout = 5_000 });
        await page.GetByTestId("account-menu-logout").ClickAsync();

        // useLogout ends in a full page reload to '/' (window.location.assign),
        // not an in-app navigation — wait for what it shows next rather than
        // a URL change (the path doesn't change).
        var returningLoginPanel = page.GetByTestId("returning-login-panel");
        await Assertions.Expect(returningLoginPanel).ToBeVisibleAsync(new() { Timeout = 15_000 });

        // The reload lands on the landing page (no `#no-intro`), which covers the
        // gate until the player picks "Go to the map".
        await page.GetByTestId("landing-map").ClickAsync();
        await Assertions.Expect(page.GetByTestId("landing-page")).ToHaveCountAsync(0, new() { Timeout = 60_000 });
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
            new Regex(@"/settlement(#q=[^#]*)?$"), new PageAssertionsToHaveURLOptions { Timeout = 15_000 });
        await Assertions.Expect(returningLoginPanel).Not.ToBeVisibleAsync();
        await Assertions.Expect(accountMenuTrigger).ToBeVisibleAsync(new() { Timeout = 10_000 });

        var membershipAfterRelogin = await claimedHttpClient.GetFromJsonAsync<WorldMembershipResponse>(
            $"/api/v1/worlds/{world.Id}/membership", cancellationToken);
        Assert.Equal(settlement.Id.ToString(), membershipAfterRelogin!.SettlementId);

        Assert.True(consoleErrors.Count == 0, $"Unexpected console errors:\n{string.Join("\n", consoleErrors)}");
    }

    /// <summary>
    /// Polls the settlement until a building of <paramref name="type"/> stands in it at level 1 or more (one still
    /// under construction is listed as a level-0 foundation). Reading it settles finished orders on the server.
    /// </summary>
    private static async Task WaitForStandingBuildingAsync(
        HttpClient apiClient, Guid settlementId, string type, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(45));
        while (true)
        {
            var current = await apiClient.GetFromJsonAsync<SettlementResponse>(
                $"/api/v1/settlements/{settlementId}", timeout.Token);
            if (current!.Buildings.Any(b => b.Type == type && b.Level >= 1)) return;
            await Task.Delay(TimeSpan.FromMilliseconds(500), timeout.Token);
        }
    }
}
