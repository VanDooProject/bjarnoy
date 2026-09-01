using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Regression test for issue #96: clicking a tile on the landing page founded
/// the settlement on whichever unclaimed start position was nearest the
/// click's *origin* (the landing page's fixed preview centre), not on the
/// hex actually clicked — so a click almost always landed on the same
/// "suggested" plot regardless of where on the map the player actually
/// clicked. <see cref="LiveFrontendTestHelpers.FoundStartingSettlementAsync"/>
/// always clicks that one suggested plot and can't catch this; this test
/// deliberately clicks a *different* unclaimed start position and asserts
/// the settlement is founded there.
/// </summary>
/// <remarks>
/// <para>
/// Unlike every other test here, this one creates the world it drives
/// (<see cref="PinnedWorldSeed"/>) instead of using whichever one the API
/// seeded itself at startup — <c>WorldService.SeedDefaultWorldIfNoneAsync</c>
/// draws a <c>Random.Shared.Next()</c> seed, so that world's terrain (and
/// therefore where its start positions are) differs on every CI run. That
/// mattered here and nowhere else: the landing page previews a fixed camera
/// centred on the *suggested* plot at <c>PREVIEW_ZOOM</c>, so whether any
/// *other* start position is even on screen to be clicked is a property of
/// the generated terrain. Surveying 100 random seeds through the real
/// <c>WorldGenerator</c> and this file's own projection, ~14% of worlds have
/// no second start position anywhere inside the preview viewport at all —
/// this test then clicked a point outside the canvas ten times over and
/// failed with "Clicking the non-suggested start position never founded a
/// settlement", which is exactly the intermittent aspire-e2e failure seen on
/// main (run #306) and the reason the suite's failure count differed between
/// two runs of the same commit. Pinning the seed makes the world — and so
/// the geometry this test's whole point depends on — the same every run;
/// the click point is still derived from the renderer's own camera math
/// below rather than hardcoded, so a projection change still fails loudly.
/// </para>
/// <para>
/// The frontend joins the newest world (<c>bootstrapLiveWorld</c> →
/// <c>newestWorld</c>, ordered by UUIDv7 id), so creating this one before the
/// browser ever navigates is all it takes for the page under test to land in
/// it. <c>POST /worlds</c> is unauthenticated today (see
/// <c>WorldEndpoints</c>), so no admin login is needed for it.
/// </para>
/// </remarks>
public class FoundingOnClickedTileTests
{
    /// <summary>
    /// A world whose start positions cluster tightly around the plot nearest
    /// the origin: at 1280x720 its eight nearest alternatives to the suggested
    /// plot all project comfortably inside the canvas (the nearest two at
    /// (769,337) and (845,406)), so the click this test needs to make is well
    /// clear of every edge. Any seed with that property would do; this one was
    /// picked out of the 100-seed survey described in the class remarks.
    /// </summary>
    private const int PinnedWorldSeed = 5538230;

    [Fact]
    public async Task ClickingADifferentStartPositionFoundsTheSettlementThereNotOnTheSuggestedTile()
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

        // Created before the browser navigates, so bootstrapLiveWorld()'s
        // newestWorld() picks this one rather than the API's own startup-seeded
        // (random-seed) world — see the class remarks for why this test needs a
        // known terrain when none of the others do.
        var createWorld = await apiClient.PostAsJsonAsync(
            "/api/v1/worlds",
            new CreateWorldRequest($"Founding click test {Guid.NewGuid():N}", Seed: PinnedWorldSeed),
            cancellationToken);
        createWorld.EnsureSuccessStatusCode();
        var world = (await createWorld.Content.ReadFromJsonAsync<WorldResponse>(cancellationToken))!;
        Assert.Equal(PinnedWorldSeed, world.Seed);

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        var page = await browser.NewPageAsync();
        var consoleErrors = page.CollectConsoleErrors();

        await page.GotoAsync(frontendUrl, new PageGotoOptions { Timeout = 120_000 });
        await Assertions.Expect(page.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        var canvas = page.Locator("canvas");
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });

        // The page must actually have joined the world created above, not some
        // other one — everything below is computed from this world's islands.
        var joinedWorldId = await page.EvaluateAsync<string?>("() => localStorage.getItem('bjarnoy.worldId')");
        Assert.Equal(world.Id.ToString(), joinedWorldId);

        var islands = await apiClient.GetFromJsonAsync<IslandResponse[]>(
            $"/api/v1/worlds/{world.Id}/islands", cancellationToken);
        var startPositions = islands!.SelectMany(i => i.StartPositions).ToList();

        // Mirrors world.ts's nearestStartPosition({q:0,r:0}) — what LandingView
        // previews/highlights as the "suggested" plot before anything is
        // claimed. That store walks the islands in this same order and keeps
        // the first strict minimum, which a stable OrderBy reproduces exactly.
        // The regression is a click landing there regardless of which hex was
        // actually clicked, so the test must click a *different* one and prove
        // it lands exactly there instead.
        var origin = new TileCoordinate(0, 0);
        var suggested = startPositions.OrderBy(p => HexDistance(origin, p)).First();

        var box = await canvas.BoundingBoxAsync()
            ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");

        // Nearest alternative plot that actually renders somewhere clickable.
        // "On the canvas" isn't enough on its own: the onboarding tray
        // (LandingView's .tray, bottom: 96px) sits over the map and would eat
        // the click, so the bottom strip is excluded outright. The hero copy
        // and the top bar are both pointer-events: none, so only their
        // geometry — not their clicks — matters. With the pinned seed above
        // this always resolves to a neighbouring plot near the middle of the
        // canvas; the search (rather than a hardcoded offset) is what makes it
        // survive a different browser window size.
        const double edgeInset = 80;
        const double trayInset = 200;
        var clickable = startPositions
            .Where(p => !(p.Q == suggested.Q && p.R == suggested.R))
            .OrderBy(p => HexDistance(suggested, p))
            .Select(p => (Coord: p, Screen: ScreenPositionOf(p, suggested, (box.Width, box.Height))))
            .Where(c =>
                c.Screen.x >= edgeInset && c.Screen.x <= box.Width - edgeInset
                && c.Screen.y >= edgeInset && c.Screen.y <= box.Height - trayInset)
            .ToList();

        Assert.True(
            clickable.Count > 0,
            $"No unclaimed start position other than the suggested one ({suggested.Q}|{suggested.R}) renders "
            + $"inside the {box.Width}x{box.Height} preview viewport for seed {PinnedWorldSeed} — this test has "
            + "nothing it can click. Re-run the seed survey in this file's remarks and pin a different seed.");

        var (target, click) = clickable[0];
        Assert.NotEqual(suggested, target);

        var trayStatus = page.Locator(".tray-item .sub").First;
        var founded = false;
        for (var attempt = 0; attempt < 10 && !founded; attempt++)
        {
            // Retried for the same reason LiveFrontendTestHelpers's own click
            // is: a cold Vite dev server can still be mid camera-transition
            // the instant the canvas first appears. The box is re-read every
            // attempt rather than reused from above — the projection is
            // relative to it, so a canvas that resized (a late-arriving
            // scrollbar, a layout settling) after the first read would
            // otherwise keep aiming at the old geometry for all ten tries.
            var attemptBox = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
            var attemptClick = ScreenPositionOf(target, suggested, (attemptBox.Width, attemptBox.Height));
            await page.Mouse.ClickAsync(
                attemptBox.X + (float)attemptClick.x, attemptBox.Y + (float)attemptClick.y);
            try
            {
                await Assertions.Expect(trayStatus).ToHaveTextAsync("Placed", new() { Timeout = 2_000 });
                founded = true;
            }
            catch (PlaywrightException)
            {
                await page.WaitForTimeoutAsync(1_000);
            }
        }

        Assert.True(
            founded,
            $"Clicking the non-suggested start position ({target.Q}|{target.R}) at "
            + $"({click.x:F0},{click.y:F0}) in a {box.Width}x{box.Height} canvas never founded a settlement. "
            + $"Suggested plot was ({suggested.Q}|{suggested.R}). "
            + $"Hero status: [{string.Join(" | ", await page.Locator(".hero .status").AllTextContentsAsync())}]. "
            + $"Console errors: [{string.Join(" | ", consoleErrors)}]");

        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlement = Assert.Single(settlements!);

        Assert.Equal(target.Q, settlement.Q);
        Assert.Equal(target.R, settlement.R);
        // The actual bug: before the fix this would equal `suggested`, not `target`.
        Assert.False(settlement.Q == suggested.Q && settlement.R == suggested.R,
            "Settlement founded on the suggested tile instead of the one actually clicked.");

        Assert.Empty(consoleErrors);
    }

    private static int HexDistance(TileCoordinate a, TileCoordinate b)
    {
        var aq = a.Q; var ar = a.R; var asq = -a.Q - a.R;
        var bq = b.Q; var br = b.R; var bs = -b.Q - b.R;
        return Math.Max(Math.Abs(aq - bq), Math.Max(Math.Abs(ar - br), Math.Abs(asq - bs)));
    }

    // Ports HexMapRenderer's preview-mode iso projection (isoGridPosition,
    // biasedCenterX, worldToScreen — src/frontend/src/lib/hex/geometry.ts and
    // lib/map/camera.ts) just far enough to compute where a given start
    // position renders on screen while the landing page previews around
    // `previewCenter` (LandingView's suggested tile). If that projection ever
    // changes, this starts clicking the wrong pixel and this test's own
    // "Placed" wait will fail loudly rather than silently mis-asserting.
    private const double TileW = 168;
    private const double TileH = TileW * 92.0 / 200.0;
    private const double PreviewZoom = 0.6;
    private const double ScreenBiasX = 0.16; // LandingView's :screen-bias-x

    private static (double x, double y) ScreenPositionOf(
        TileCoordinate coord, TileCoordinate previewCenter, (double width, double height) viewport)
    {
        var previewGrid = IsoGridPosition(previewCenter);
        var centerX = previewGrid.x + TileW / 2;
        var centerY = previewGrid.y + TileH / 2;
        var cameraX = centerX - (ScreenBiasX * viewport.width) / PreviewZoom;
        var cameraY = centerY;

        var grid = IsoGridPosition(coord);
        var worldX = grid.x + TileW / 2;
        var worldY = grid.y + TileH / 2;

        return (
            (worldX - cameraX) * PreviewZoom + viewport.width / 2,
            (worldY - cameraY) * PreviewZoom + viewport.height / 2);
    }

    private static (double x, double y) IsoGridPosition(TileCoordinate c)
    {
        var col = c.Q;
        var row = c.R + (c.Q - (c.Q & 1)) / 2;
        var colPitch = TileW * 0.75;
        var x = col * colPitch;
        var y = row * TileH + ((col & 1) != 0 ? TileH / 2 : 0);
        return (x, y);
    }
}
