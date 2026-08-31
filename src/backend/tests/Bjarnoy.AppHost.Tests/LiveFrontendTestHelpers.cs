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

        var founded = false;
        for (var attempt = 0; attempt < 10 && !founded; attempt++)
        {
            var box = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
            // Matches e2e/helpers.ts's foundSettlement click point (0.66 of
            // the viewport width, vertical centre) — the real world's own
            // starter plot, via WorldModel.findLandfall against this run's
            // seed (see bootstrapLiveWorld), shifted by screenBiasX. Retried
            // rather than trusted first-try: a cold Vite dev server can still
            // be mid camera-transition the instant the canvas first appears.
            await page.Mouse.ClickAsync(box.X + box.Width * 0.66f, box.Y + box.Height / 2);
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
