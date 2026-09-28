using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Viewing a real, resolved battle report through the reports modal
/// (<c>ReportsModal.vue</c>/<c>ReportsView.vue</c>), end to end through the
/// real frontend against the real live backend — desktop chrome (the
/// floating × close button) and phone chrome (a fullscreen panel with a back
/// chevron, no close button) both driven against the exact same report.
/// </summary>
/// <remarks>
/// <para>
/// This lives here rather than in <c>src/frontend/e2e</c> because that
/// suite's own Playwright config only ever starts a backend-less
/// <c>vite preview</c> build of demo mode (see
/// <see cref="ProfileEditPersistenceTests"/>'s own remarks on the same
/// limitation): demo mode has no combat, no armies, and no reports endpoint
/// to speak of, so a report can never exist there to click on in the first
/// place. Proving the modal actually renders a real, backend-resolved
/// battle needs the real API, which only this AppHost suite boots.
/// </para>
/// <para>
/// A land army can only ever fight another settlement on the <em>same</em>
/// island — <c>HexPathfinder</c> paths land units over land only, and there
/// is no ferry/transport mechanic (see <c>Army</c>'s own class remarks), so
/// two settlements on different islands can never reach each other overland.
/// The default world's map comes from a random seed, though, so which (if
/// any) island has two start positions far enough apart to found two
/// unrelated settlements on is not knowable up front. This iterates
/// candidate seeds through the admin seed-preview endpoint (nothing
/// persisted, see <c>AdminWorldEndpoints.PreviewSeed</c>) until one produces
/// a non-Wasted island with two start positions at least
/// <see cref="SettlementService.MinimumSpacing"/> hexes apart — the same
/// spacing rule <c>Settlement.FoundAsync</c> itself enforces between any two
/// settlements — and only then commits that seed via
/// <c>AdminWorldEndpoints.Reseed</c>, so the world this test actually plays
/// in is guaranteed to support the scenario instead of hoping the default
/// random seed happens to.
/// </para>
/// <para>
/// Both settlements are founded anonymously over plain HTTP, with no bearer
/// token attached — a founding request made through an authenticated
/// <see cref="HttpClient"/> would attach the new settlement to that account
/// rather than to the plain <c>OwnerId</c> string in the request body (see
/// <c>SettlementEndpoints.Found</c>'s <c>callerUserId</c> handling), and the
/// browser driving the desktop/phone assertions below only ever "logs in" by
/// having the right <c>localStorage</c> keys already present (the same keys
/// <c>stores/player.ts</c>/<c>stores/world.ts</c> use to restore a returning
/// player's session on reload) — it never goes through <c>LoginView</c> or a
/// JWT at all, since a plain anonymous player never does either. The rival
/// settlement is founded the same way, under an unrelated <c>ownerId</c>, so
/// it is never adopted by the same browser.
/// </para>
/// <para>
/// Both settlements are founded directly against
/// <c>POST /worlds/{worldId}/settlements</c> rather than through the
/// landing page's founding UI: that UI's own plot suggestion
/// (<c>PlotReservationService</c>) always steers a second visitor toward the
/// least-populated island in the world, i.e. deliberately never the island
/// the first settlement just landed on — exactly the opposite of what this
/// scenario needs.
/// </para>
/// </remarks>
public class ReportsModalTests
{
    /// <summary>
    /// How many candidate seeds to try before giving up — see this class's
    /// own remarks. Each attempt is a single in-memory map generation
    /// (<c>WorldService.PreviewAsync</c>), not a database write, so this is
    /// cheap; in practice a qualifying seed has always turned up within the
    /// first handful of attempts.
    /// </summary>
    private const int MaxSeedAttempts = 200;

    [Fact]
    public async Task ViewingAResolvedBattleReportThroughTheRealFrontendWorksOnDesktopAndPhone()
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

        using var adminHttpClient = await LiveFrontendTestHelpers.LoginAsAdminAsync(app, resourceNotifications, cancellationToken);

        // --- Find (and commit) a world map that actually supports two
        // unrelated settlements on the same island (see class remarks) ---
        var world = Assert.Single(
            (await apiClient.GetFromJsonAsync<WorldSummaryResponse[]>("/api/v1/worlds", cancellationToken))!);

        (int IslandIndex, TileCoordinate A, TileCoordinate B, int Seed)? found = null;
        for (var seed = 1; seed <= MaxSeedAttempts && found is null; seed++)
        {
            var previewResponse = await adminHttpClient.PostAsJsonAsync(
                $"/api/v1/admin/worlds/{world.Id}/preview-seed",
                new PreviewWorldSeedRequest(Seed: seed),
                cancellationToken);
            previewResponse.EnsureSuccessStatusCode();
            var preview = (await previewResponse.Content.ReadFromJsonAsync<WorldSeedPreviewResponse>(cancellationToken))!;

            foreach (var island in preview.Islands)
            {
                if (island.Wasted || island.StartPositions.Count < 2)
                {
                    continue;
                }

                for (var i = 0; i < island.StartPositions.Count && found is null; i++)
                {
                    for (var j = i + 1; j < island.StartPositions.Count; j++)
                    {
                        var a = island.StartPositions[i];
                        var b = island.StartPositions[j];
                        var distance = HexCoord.Distance(new HexCoord(a.Q, a.R), new HexCoord(b.Q, b.R));
                        if (distance >= SettlementService.MinimumSpacing)
                        {
                            found = (island.Index, a, b, seed);
                            break;
                        }
                    }
                }
            }
        }

        Assert.True(
            found is not null,
            $"No seed among the first {MaxSeedAttempts} produced a non-Wasted island with two start "
                + $"positions >= {SettlementService.MinimumSpacing} hexes apart.");

        var (islandIndex, playerStart, rivalStart, chosenSeed) = found!.Value;

        var reseedResponse = await adminHttpClient.PostAsJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/reseed",
            new ReseedWorldRequest(ConfirmWorldName: world.Name, Seed: chosenSeed),
            cancellationToken);
        reseedResponse.EnsureSuccessStatusCode();

        var islands = await apiClient.GetFromJsonAsync<IslandResponse[]>(
            $"/api/v1/worlds/{world.Id}/islands", cancellationToken);
        var targetIsland = Assert.Single(islands!, i => i.Index == islandIndex);

        // --- Found both settlements anonymously (see class remarks) ---
        var playerOwnerId = $"player_{Guid.NewGuid():N}";
        var rivalOwnerId = $"player_{Guid.NewGuid():N}";

        using var playerHttpClient = app.CreateHttpClient("api");
        using var rivalHttpClient = app.CreateHttpClient("api");

        var playerFoundResponse = await playerHttpClient.PostAsJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(targetIsland.Id, playerStart.Q, playerStart.R, "Playertown", "Attacker", playerOwnerId),
            cancellationToken);
        playerFoundResponse.EnsureSuccessStatusCode();
        var playerSettlement =
            (await playerFoundResponse.Content.ReadFromJsonAsync<SettlementResponse>(cancellationToken))!;

        var rivalFoundResponse = await rivalHttpClient.PostAsJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(targetIsland.Id, rivalStart.Q, rivalStart.R, "Rivaltown", "Defender", rivalOwnerId),
            cancellationToken);
        rivalFoundResponse.EnsureSuccessStatusCode();
        var rivalSettlement =
            (await rivalFoundResponse.Content.ReadFromJsonAsync<SettlementResponse>(cancellationToken))!;

        playerHttpClient.DefaultRequestHeaders.Add("X-Owner-Id", playerOwnerId);

        // --- Speed the world up before dispatch (travel time is fixed at
        // dispatch, not re-evaluated later — see Army.PlanDispatch's
        // speedFactor parameter) so a handful of hexes' travel time needs
        // only a token amount of provisions, comfortably inside both the
        // garrison's food-carry capacity and the settlement's founding food
        // stock (BuildingCatalogue.FoundingStock) ---
        var speedUpResponse = await adminHttpClient.PatchAsJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest { SpeedFactor = 50.0 },
            cancellationToken);
        speedUpResponse.EnsureSuccessStatusCode();

        // --- Garrison the attacker with a real land unit (Spearman needs no
        // building beyond what AdjustGarrisonAsync's admin god-mode already
        // bypasses — see UnitCatalogue.Get(UnitType.Spearman)) ---
        var garrisonResponse = await adminHttpClient.PostAsJsonAsync(
            $"/api/v1/admin/settlements/{playerSettlement.Id}/garrison",
            new AdjustGarrisonRequest("spearman", 10),
            cancellationToken);
        garrisonResponse.EnsureSuccessStatusCode();

        // --- Dispatch an attack on the undefended rival ---
        var dispatchResponse = await playerHttpClient.PostAsJsonAsync(
            $"/api/v1/settlements/{playerSettlement.Id}/armies",
            new DispatchArmyRequest(
                Units: [new UnitCountRequest("spearman", 10)],
                Waypoints: null,
                Destination: null,
                Provisions: 50,
                Mission: "attack",
                TargetSettlementId: rivalSettlement.Id),
            cancellationToken);
        if (dispatchResponse.StatusCode != System.Net.HttpStatusCode.Created)
        {
            var body = await dispatchResponse.Content.ReadAsStringAsync(cancellationToken);
            Assert.Fail($"Dispatching the attack was refused ({dispatchResponse.StatusCode}): {body}");
        }

        var army = (await dispatchResponse.Content.ReadFromJsonAsync<ArmyResponse>(cancellationToken))!;

        // --- Admin: land the army immediately instead of waiting out its
        // real travel time ---
        var landResponse = await adminHttpClient.PatchAsJsonAsync(
            $"/api/v1/admin/armies/{army.Id}",
            new AdminEditArmyRequest(ArriveInMinutes: 0),
            cancellationToken);
        landResponse.EnsureSuccessStatusCode();

        // --- Reading the army is what actually resolves the battle (there is
        // no background worker — see Army.SettleArrival's callers); only
        // after this has the report been created ---
        var arrivedArmyResponse = await playerHttpClient.GetAsync(
            $"/api/v1/armies/{army.Id}", cancellationToken);
        arrivedArmyResponse.EnsureSuccessStatusCode();

        var reports = await playerHttpClient.GetFromJsonAsync<BattleReportResponse[]>(
            $"/api/v1/settlements/{playerSettlement.Id}/reports", cancellationToken);
        var report = Assert.Single(reports!);
        // The rival garrison is empty, so any attacker with positive attack
        // power wins outright (BattleResolver.Resolve) — the attacker here
        // (10 Spearmen) certainly has some.
        Assert.Equal("attacker", report.Winner);

        var reportId = report.Id;

        var screenshotsDir = Path.Combine(AppContext.BaseDirectory, "screenshots");
        Directory.CreateDirectory(screenshotsDir);

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();

        // --- Desktop: HudNav's "Reports" button opens the modal over the settlement view ---
        var desktopContext = await browser.NewContextAsync();
        var desktopPage = await desktopContext.NewPageAsync();
        var desktopConsoleErrors = desktopPage.CollectConsoleErrors();

        await desktopPage.AddInitScriptAsync(BuildLoginInitScript(playerOwnerId, playerSettlement.Id.ToString()));
        await desktopPage.GotoAsync($"{frontendUrl}settlement", new PageGotoOptions { Timeout = 120_000 });

        var canvas = desktopPage.Locator("canvas");
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });

        var reportsLink = desktopPage.Locator(".hud-nav button.reports-link");
        await Assertions.Expect(reportsLink).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await reportsLink.ClickAsync();

        var reportsModal = desktopPage.Locator("[data-testid=\"reports-modal\"]");
        await Assertions.Expect(reportsModal).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await desktopPage.WaitForURLAsync(url => url.EndsWith("/reports"), new PageWaitForURLOptions { Timeout = 10_000 });
        await Assertions.Expect(reportsModal.Locator(".close-button")).ToBeVisibleAsync();

        var reportRow = reportsModal.Locator("[data-testid=\"report-row\"]").Filter(new LocatorFilterOptions { HasText = "Victory" });
        await Assertions.Expect(reportRow).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await reportsModal.ScreenshotAsync(new LocatorScreenshotOptions
        {
            Path = Path.Combine(screenshotsDir, "reports-modal-desktop-list.png"),
        });

        await reportRow.ClickAsync();
        await Assertions.Expect(reportsModal.Locator("[data-testid=\"report-detail\"]")).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await desktopPage.WaitForURLAsync(url => url.EndsWith($"/reports/{reportId}"), new PageWaitForURLOptions { Timeout = 10_000 });
        await reportsModal.ScreenshotAsync(new LocatorScreenshotOptions
        {
            Path = Path.Combine(screenshotsDir, "reports-modal-desktop-detail.png"),
        });

        await reportsModal.Locator("[data-testid=\"reports-back-to-list\"]").ClickAsync();
        await Assertions.Expect(reportRow).ToBeVisibleAsync(new() { Timeout = 15_000 });

        await reportsModal.Locator(".close-button").ClickAsync();
        await Assertions.Expect(reportsModal).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });
        await desktopPage.WaitForURLAsync(url => url.EndsWith("/settlement"), new PageWaitForURLOptions { Timeout = 10_000 });
        await Assertions.Expect(canvas).ToBeVisibleAsync();

        Assert.Empty(desktopConsoleErrors);

        // --- Phone: a deep link straight into the report detail renders the
        // modal fullscreen over the (also freshly restored) settlement view ---
        var phoneContext = await browser.NewContextAsync(new BrowserNewContextOptions
        {
            ViewportSize = new ViewportSize { Width = 390, Height = 844 },
            HasTouch = true,
            IsMobile = true,
        });
        var phonePage = await phoneContext.NewPageAsync();
        var phoneConsoleErrors = phonePage.CollectConsoleErrors();

        await phonePage.AddInitScriptAsync(BuildLoginInitScript(playerOwnerId, playerSettlement.Id.ToString()));
        await phonePage.GotoAsync($"{frontendUrl}reports/{reportId}", new PageGotoOptions { Timeout = 120_000 });

        var phoneModal = phonePage.Locator("[data-testid=\"reports-modal\"]");
        await Assertions.Expect(phoneModal).ToBeVisibleAsync(new() { Timeout = 30_000 });

        var modalBox = await phoneModal.BoundingBoxAsync()
            ?? throw new InvalidOperationException("The mobile reports modal never rendered a bounding box.");
        Assert.InRange(modalBox.X, -1, 1);
        Assert.InRange(modalBox.Width, 385, 395);

        await Assertions.Expect(phoneModal.Locator(".back-button")).ToBeVisibleAsync();
        Assert.Equal(0, await phoneModal.Locator(".close-button").CountAsync());
        await Assertions.Expect(phoneModal.Locator("[data-testid=\"report-detail\"]")).ToBeVisibleAsync(new() { Timeout = 15_000 });

        await phoneModal.ScreenshotAsync(new LocatorScreenshotOptions
        {
            Path = Path.Combine(screenshotsDir, "reports-modal-phone-detail.png"),
        });

        var overflows = await phoneModal.EvaluateAsync<bool>("el => el.scrollWidth > el.clientWidth + 1");
        Assert.False(overflows, "The mobile reports panel overflows its own viewport width.");

        await phoneModal.Locator(".back-button").TapAsync();
        var phoneReportRow = phoneModal.Locator("[data-testid=\"report-row\"]").Filter(new LocatorFilterOptions { HasText = "Victory" });
        await Assertions.Expect(phoneReportRow).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await phonePage.WaitForURLAsync(url => url.EndsWith("/reports"), new PageWaitForURLOptions { Timeout = 10_000 });

        await phoneModal.ScreenshotAsync(new LocatorScreenshotOptions
        {
            Path = Path.Combine(screenshotsDir, "reports-modal-phone-list.png"),
        });

        await phoneModal.Locator(".back-button").TapAsync();
        await Assertions.Expect(phoneModal).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });
        await phonePage.WaitForURLAsync(url => url.EndsWith("/settlement"), new PageWaitForURLOptions { Timeout = 10_000 });

        Assert.Empty(phoneConsoleErrors);
    }

    /// <summary>
    /// Sets the same <c>localStorage</c> keys a returning player's reload
    /// restores from (see <c>stores/player.ts</c>'s <c>stablePlayerId</c>/
    /// <c>persistedSettlementId</c>/<c>persistedOnboardingComplete</c>) —
    /// this is how an anonymous, already-founded player is "logged in" for
    /// this test's two browser contexts, rather than through
    /// <c>LoginView</c>/a JWT, which a plain anonymous player never uses
    /// either (see this class's own remarks).
    /// </summary>
    private static string BuildLoginInitScript(string ownerId, string settlementId) => $$"""
        () => {
          localStorage.setItem('bjarnoy.playerId', {{System.Text.Json.JsonSerializer.Serialize(ownerId)}});
          localStorage.setItem('bjarnoy.settlementId', {{System.Text.Json.JsonSerializer.Serialize(settlementId)}});
          localStorage.setItem('bjarnoy.onboardingComplete', '1');
        }
        """;
}
