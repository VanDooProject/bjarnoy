using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Shared browser-driving steps every AppHost e2e test needs before it can
/// get to whatever it's actually testing: founding the one starting
/// settlement a fresh live world hands a brand-new player. Extracted from
/// <see cref="FoundingSettlementPersistenceTests"/> (the original, and still
/// the regression test for the founding flow itself) so the troop-system e2e
/// tests (training, dispatch) don't each re-implement the same click-retry
/// dance just to get a settlement to work with.
/// </summary>
public static class LiveFrontendTestHelpers
{
    /// <summary>
    /// Whether the page is ready to hand over a founding click point:
    /// <c>window.__settlementRenderer()</c> (installed at the end of
    /// LandingView's <c>onMounted</c>) resolves to a renderer that is still
    /// previewing a plot. The canvas becoming visible is NOT the same signal —
    /// the hook is installed a few statements later, and in live mode that is
    /// behind <c>bootstrapLiveWorld</c>/<c>refreshPlotSuggestion</c>, so on a
    /// cold Vite dev server the two can be seconds apart.
    /// </summary>
    private const string ClickPointReadyScript = """
        () => {
          const renderer = window.__settlementRenderer?.();
          return !!(renderer && renderer.previewCenter);
        }
        """;

    /// <summary>
    /// Reads the live plot's exact screen point from the page's own renderer,
    /// the same way <c>e2e/helpers.ts</c>'s <c>claimLandfall</c> does:
    /// <c>window.__settlementRenderer().previewCenter</c> is LandingView's
    /// <c>previewCoord</c> (live mode: <c>world.plotSuggestion.plot</c>), and
    /// <c>hexCenterScreen</c> is the renderer's own camera math converting
    /// that coordinate to a screen point. Only ever called once
    /// <see cref="ClickPointReadyScript"/> has reported ready, so a null here
    /// means the preview went away again mid-flight rather than "not yet".
    /// </summary>
    private const string ClickPointScript = """
        () => {
          const renderer = window.__settlementRenderer?.();
          if (!renderer?.previewCenter) return null;
          const p = renderer.hexCenterScreen(renderer.previewCenter);
          return [p.x, p.y];
        }
        """;

    /// <summary>
    /// What the page can actually tell us about why a click point was not
    /// available, for the exception message. The original failure this exists
    /// for reported only "never founded" with an empty console, which cannot
    /// distinguish "the hook was never installed" from "the hook was there but
    /// the preview had already been torn down" — two completely different
    /// bugs, neither diagnosable from CI without this.
    /// </summary>
    private const string ClickPointDiagnosticsScript = """
        () => {
          const hook = window.__settlementRenderer;
          if (typeof hook !== 'function') return 'hook not installed';
          const renderer = hook();
          if (!renderer) return 'hook installed, but it resolved to no renderer (canvas unmounted?)';
          if (!renderer.previewCenter) return 'renderer present, but previewCenter is unset (already founded, or preview torn down)';
          return 'ready';
        }
        """;

    /// <summary>
    /// Navigates <paramref name="page"/> to <paramref name="frontendUrl"/> and
    /// founds the starting settlement through the real UI, the same way a
    /// brand-new player does. Returns once the tray confirms
    /// <c>player.hasFoundedSettlement</c> is true (mirrors
    /// <see cref="FoundingSettlementPersistenceTests"/>'s own click-retry loop
    /// and its reasoning — see that file for why the retry exists).
    /// </summary>
    public static async Task FoundStartingSettlementAsync(IPage page, string frontendUrl)
    {
        await page.GotoAsync(frontendUrl, new PageGotoOptions { Timeout = 120_000 });

        // This is the bug FoundingSettlementPersistenceTests exists for:
        // DemoModeBadge.vue only renders while config.ts's DEMO_MODE is true,
        // which it wrongly defaults to whenever the frontend doesn't know
        // about a real backend.
        await Assertions.Expect(page.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        var trayStatus = page.Locator(".tray-item .sub").First;
        var canvas = page.Locator("canvas");
        // The canvas mounts only once PixiJS has a WebGL context and its
        // first frame ready — on a cold, unbundled Vite dev server under
        // headless Chromium with no real GPU, that first frame has taken
        // close to Playwright's 30s default actionability timeout on its
        // own. Wait for it explicitly, once, with real headroom.
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });

        // Diagnostic-only capture for the exception message below — not an
        // assertion on its own. Scoped to just this call (not the whole
        // test's own CollectConsoleErrors(), which a caller may also be
        // using for its own final assertion).
        var consoleMessages = new List<string>();
        void OnConsole(object? _, IConsoleMessage msg) => consoleMessages.Add($"[{msg.Type}] {msg.Text}");
        page.Console += OnConsole;

        // docs/plans/landing-page-defects.md's "Test debt this work must pay
        // off": this used to click a hardcoded `0.66 × width` pixel and lean
        // on the retry loop below to paper over the fact that the target
        // wasn't actually known — which silently broke the moment the
        // pre-founding camera framing changed (L4/L5). The click point now
        // comes from the renderer's own camera math instead.
        //
        // Waiting for the hook explicitly, rather than folding "not ready yet"
        // into the click retry: the canvas turning visible does NOT imply the
        // hook is installed (see ClickPointReadyScript), so a hook that was
        // merely slow used to burn all ten attempts silently and fail as
        // "never founded" with an empty console — indistinguishable from a
        // click that landed on the wrong hex. A dedicated wait with its own
        // generous timeout separates "the page never offered a plot" from
        // "the plot was offered and clicking it didn't found", and the
        // diagnostic below says which.
        try
        {
            await page.WaitForFunctionAsync(ClickPointReadyScript, null, new() { Timeout = 60_000 });
        }
        catch (PlaywrightException ex)
        {
            page.Console -= OnConsole;
            var state = await page.EvaluateAsync<string>(ClickPointDiagnosticsScript);
            throw new InvalidOperationException(
                $"The landing page never offered a founding plot ({state}). "
                + $"URL: {page.Url}. "
                + $"Recent console messages: [{string.Join(" | ", consoleMessages.TakeLast(20))}]",
                ex);
        }

        var founded = false;
        for (var attempt = 0; attempt < 10 && !founded; attempt++)
        {
            var box = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");

            // Re-read every attempt rather than once before the loop: a failed
            // founding re-requests the suggestion (LandingView's `foundHere`
            // catch -> `refreshPreview`), which can legitimately move the plot
            // to a different hex between attempts.
            var point = await page.EvaluateAsync<double[]?>(ClickPointScript);
            if (point is null)
            {
                // Ready a moment ago but not now: the preview was torn down
                // mid-flight, which most likely means a previous attempt's
                // click DID found and the view has already flipped into
                // settlement mode. There is no plot left to click, so settle
                // it on the tray rather than burning the remaining attempts
                // clicking into a view that can no longer found.
                try
                {
                    await Assertions.Expect(trayStatus).ToHaveTextAsync("Placed", new() { Timeout = 10_000 });
                    founded = true;
                }
                catch (PlaywrightException)
                {
                    // Genuinely gone without founding — fall through to the
                    // diagnostic throw below.
                }

                break;
            }

            await page.Mouse.ClickAsync(box.X + (float)point[0], box.Y + (float)point[1]);
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

        page.Console -= OnConsole;

        if (!founded)
        {
            // LandingView.vue's own status line — "Making landfall…" while a
            // request is in flight, or the "You can't found there — pick one
            // of the glowing plots" hint when the click didn't land on an
            // exact, unclaimed start position (see startPositionAt, issue
            // #96) — is the difference between "the request never went out"
            // and "the click hit the wrong hex", so surface it rather than
            // leaving this exception to guess.
            var heroStatus = await page.Locator(".hero .status").AllTextContentsAsync();
            var recentConsole = consoleMessages.Count > 20
                ? consoleMessages.Skip(consoleMessages.Count - 20)
                : consoleMessages;
            throw new InvalidOperationException(
                "Clicking the starter plot never founded a settlement. "
                + $"Hero status: [{string.Join(" | ", heroStatus)}]. "
                + $"Recent console messages: [{string.Join(" | ", recentConsole)}]");
        }
    }
}
