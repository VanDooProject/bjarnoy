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
/// mattered here and nowhere else: the landing page previews a locked camera
/// fitted to the drawn crop around the suggested plot, so whether any
/// *other* start position is even on screen to be clicked is a property of
/// the generated terrain. Surveying 100 random seeds through the real
/// <c>WorldGenerator</c> and a projection of that camera, ~14% of worlds have
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
    /// A world whose backend-suggested plot has at least one same-island
    /// alternative (<c>PlotReservationService.AlternativeCount</c>) that
    /// projects well inside a 1280x720 canvas, so the click this test needs
    /// to make is well clear of every edge. (The exact pair is deliberately
    /// not written down here — it has already changed once, when the
    /// suggestion service began ordering alternatives by distance from the
    /// pin, and a stale example in a comment is worse than none. The test
    /// picks whichever alternative actually projects somewhere clickable and
    /// names it in its own failure message.) Any seed with that property
    /// would do; this
    /// one was picked out of the 100-seed survey described in the class
    /// remarks (against the older, client-side placement rule — re-verified
    /// against the current backend-owned suggestion by a throwaway harness
    /// reproducing <c>ComputeFreshPin</c> for a zero-population world, which
    /// is what this test's own fresh world always is).
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
        // other one — everything below is computed from this world's plot
        // suggestion.
        var joinedWorldId = await page.EvaluateAsync<string?>("() => localStorage.getItem('bjarnoy.worldId')");
        Assert.Equal(world.Id.ToString(), joinedWorldId);

        // player.ts mints and persists this on store creation (stablePlayerId),
        // well before the canvas renders — the same id the page itself sends
        // as X-Owner-Id, and the only way from outside the page to ask the
        // backend what *this* visitor was actually offered.
        var ownerId = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        // What LandingView previews/highlights as the "suggested" plot before
        // anything is claimed: plot-finding is entirely backend-owned now
        // (PlotReservationService) — the frontend just displays and clicks
        // whatever this endpoint pins for this owner, so the test has to ask
        // it the same question rather than recomputing a placement rule of
        // its own. The regression is a click landing on this plot regardless
        // of which hex was actually clicked, so the test must click a
        // *different* one (one of this response's own alternatives — the
        // only other plots `startPositionAt` accepts a click on) and prove it
        // lands exactly there instead.
        var suggestionResponse = await apiClient.GetFromJsonAsync<PlotSuggestionResponse>(
            $"/api/v1/worlds/{world.Id}/plot-suggestion", cancellationToken);
        var suggested = suggestionResponse!.Plot;

        // Where a hex renders is asked of the page's own renderer rather than
        // recomputed here. This test used to carry a C# port of the preview
        // camera (a previewFitZoom/ScreenPositionOf pair, fed by a backend
        // terrain chunk to know which hexes were land) — and that port went
        // stale the moment the real camera changed: docs/plans/
        // landing-page-defects.md L4 moved the locked preview camera from
        // "centred on the suggested plot" to "centred on the drawn crop's
        // bounding box", so every point the port produced was off by the
        // difference between the two, and the click landed on a hex that was
        // not the one under test. `hexCenterScreen` is the renderer's own
        // camera math, so it cannot drift from what the player actually sees.
        await page.WaitForFunctionAsync(ClickPointReadyScript, null, new() { Timeout = 60_000 });

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
        var ordered = suggestionResponse.Alternatives
            .OrderBy(p => HexDistance(suggested, p))
            .ToList();
        var projected = await ScreenPositionsOfAsync(page, ordered);
        var clickable = ordered
            .Select((p, i) => (Coord: p, Screen: projected[i]))
            .Where(c =>
                c.Screen.x >= edgeInset && c.Screen.x <= box.Width - edgeInset
                && c.Screen.y >= edgeInset && c.Screen.y <= box.Height - trayInset)
            .ToList();

        Assert.True(
            clickable.Count > 0,
            $"No unclaimed start position other than the suggested one ({suggested.Q}|{suggested.R}) renders "
            + $"inside the {box.Width}x{box.Height} preview viewport for seed {PinnedWorldSeed} — this test has "
            + "nothing it can click. Re-run the seed survey in this file's remarks and pin a different seed. "
            + $"Alternatives projected to: [{string.Join(" | ", ordered.Select((p, i) => $"({p.Q}|{p.R})@({projected[i].x:F0},{projected[i].y:F0})"))}]");

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
            // The fit zoom is a function of that same viewport (the renderer
            // re-fits a locked camera on every resize), so it's recomputed
            // alongside it.
            var attemptBox = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
            var attemptClick = (await ScreenPositionsOfAsync(page, [target]))[0];
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

    /// <summary>
    /// Whether the page can hand over hex screen positions yet: the landing
    /// page installs <c>window.__settlementRenderer</c> at the end of its
    /// onMounted, which in live mode sits behind bootstrapLiveWorld and the
    /// plot-suggestion request — so a visible canvas does not imply it.
    /// </summary>
    private const string ClickPointReadyScript = """
        () => {
          const renderer = window.__settlementRenderer?.();
          return !!(renderer && renderer.previewCenter);
        }
        """;

    /// <summary>
    /// Projects hexes to canvas-relative screen points through the renderer's
    /// own camera math (<c>hexCenterScreen</c>), which is the same call the
    /// frontend e2e helpers use. Deliberately not a C# port of that math: the
    /// port this replaced silently aimed at the wrong pixel the moment the
    /// preview camera was reframed (landing-page-defects.md L4).
    /// </summary>
    private const string ScreenPositionsScript = """
        (coords) => {
          const renderer = window.__settlementRenderer?.();
          if (!renderer) return null;
          return coords.map((c) => {
            const p = renderer.hexCenterScreen({ q: c.q, r: c.r });
            return [p.x, p.y];
          });
        }
        """;

    private static async Task<IReadOnlyList<(double x, double y)>> ScreenPositionsOfAsync(
        IPage page, IReadOnlyList<TileCoordinate> coords)
    {
        var raw = await page.EvaluateAsync<double[][]?>(
            ScreenPositionsScript,
            coords.Select(c => new { q = c.Q, r = c.R }).ToArray())
            ?? throw new InvalidOperationException(
                "window.__settlementRenderer() resolved to no renderer while projecting hex positions.");

        return [.. raw.Select(p => (p[0], p[1]))];
    }
}