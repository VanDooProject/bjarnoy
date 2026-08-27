using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Runs the exact orchestration a developer gets from `dotnet run` in
/// Bjarnoy.AppHost (Postgres, the API, and the Vue dev server, wired
/// together as AppHost.cs describes) and drives the real frontend with a
/// real browser.
/// </summary>
/// <remarks>
/// This is the regression test for the bug where opening the frontend Aspire
/// had just started still landed you in demo mode with nothing persisted:
/// unlike `npm run dev` on its own, the frontend here has a real API and
/// database behind it, so a green run proves both that Aspire actually wires
/// the frontend to the backend (VITE_DEMO_MODE / the vite.config.ts proxy —
/// see AppHost.cs's comments on the "frontend" resource) and that founding a
/// settlement through the real UI produces a row a second, independent HTTP
/// client can read back from the database.
/// </remarks>
public class FoundingSettlementPersistenceTests
{
    [Fact]
    public async Task FoundingASettlementThroughTheRealFrontendPersistsToTheDatabase()
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

        // The frontend resource has no health check (unlike "api"), so
        // WaitForResourceHealthyAsync above only confirms the npm process
        // started — not that Vite has finished cold-starting (npm install,
        // then esbuild pre-bundling a Pixi.js-heavy dependency graph), which
        // routinely outlasts Playwright's 30s default navigation timeout in
        // a loaded CI container.
        await page.GotoAsync(frontendUrl, new PageGotoOptions { Timeout = 120_000 });

        // This is the bug itself: DemoModeBadge.vue only renders while
        // config.ts's DEMO_MODE is true, which it wrongly defaults to
        // whenever the frontend doesn't know about a real backend.
        await Assertions.Expect(page.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        // The click point matches e2e/helpers.ts's foundSettlement: the
        // camera re-centres on LandingView's previewCoord (the real world's
        // own starter plot, via WorldModel.findLandfall against the seed
        // this run's backend actually generated — see bootstrapLiveWorld),
        // shifted right by screenBiasX (0.16 of the viewport width). But
        // unlike helpers.ts's demo-mode canvas (a pre-built `vite preview`
        // bundle), this is a cold Vite *dev* server transpiling everything
        // on first request, so the camera can still be mid-transition the
        // instant the canvas first appears — a click landing before it
        // settles hits whatever was under the old camera position instead
        // of the starter plot, and onHexClick silently no-ops on sea. Retry
        // the click rather than guessing one fixed extra delay.
        var trayStatus = page.Locator(".tray-item .sub").First;
        var canvas = page.Locator("canvas");
        // The canvas mounts only once PixiJS has a WebGL context and its
        // first frame ready — on a cold, unbundled Vite dev server under
        // headless Chromium with no real GPU, that first frame has taken
        // close to Playwright's 30s default actionability timeout on its
        // own (BoundingBoxAsync's implicit wait), independent of the click
        // retries below. Wait for it explicitly, once, with real headroom.
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });
        var founded = false;
        for (var attempt = 0; attempt < 10 && !founded; attempt++)
        {
            var box = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
            await page.Mouse.ClickAsync(box.X + box.Width * 0.66f, box.Y + box.Height / 2);
            try
            {
                // The first tray item flips from the click prompt to
                // "Placed" only once `player.hasFoundedSettlement` is true,
                // which live mode only sets after
                // `foundStartingSettlementLive`'s POST to the API succeeds
                // (see LandingView.vue's foundHere).
                await Assertions.Expect(trayStatus).ToHaveTextAsync("Placed", new() { Timeout = 2_000 });
                founded = true;
            }
            catch (PlaywrightException)
            {
                await page.WaitForTimeoutAsync(1_000);
            }
        }
        Assert.True(founded, "Clicking the starter plot never founded a settlement.");

        // This test's Postgres is a fresh container of its own, so exactly
        // one world exists at this point — bootstrapLiveWorld() created it,
        // since there was nothing for it to join.
        var worlds = await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken);
        var world = Assert.Single(worlds!);

        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        Assert.Single(settlements!);

        // Regression coverage for bootstrapLiveWorld() joining the wrong
        // (or no) world for a second player: a fresh browser context, like
        // a second person opening the site in another window, with its own
        // empty localStorage — it must join the world the first page's
        // client already created rather than trying (and 409-ing) to create
        // a second "Kettil Sea".
        await using var secondContext = await browser.NewContextAsync();
        var secondPage = await secondContext.NewPageAsync();
        var secondPageConsoleErrors = secondPage.CollectConsoleErrors();

        await secondPage.GotoAsync(frontendUrl, new PageGotoOptions { Timeout = 120_000 });
        await Assertions.Expect(secondPage.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        var secondTrayStatus = secondPage.Locator(".tray-item .sub").First;
        var secondCanvas = secondPage.Locator("canvas");
        await secondCanvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });

        var secondFounded = false;
        for (var attempt = 0; attempt < 10 && !secondFounded; attempt++)
        {
            var box = await secondCanvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Second window's map canvas never rendered a bounding box.");
            await secondPage.Mouse.ClickAsync(box.X + box.Width * 0.66f, box.Y + box.Height / 2);
            try
            {
                await Assertions.Expect(secondTrayStatus).ToHaveTextAsync("Placed", new() { Timeout = 2_000 });
                secondFounded = true;
            }
            catch (PlaywrightException)
            {
                await secondPage.WaitForTimeoutAsync(1_000);
            }
        }
        Assert.True(secondFounded, "A second, independent browser session never founded a settlement in the shared world.");

        var worldsAfterSecondPlayer = await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken);
        // Still exactly one world: the second session joined it rather than
        // racing to create another "Kettil Sea" and 409-ing.
        Assert.Single(worldsAfterSecondPlayer!);

        var settlementsAfterSecondPlayer = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        Assert.Equal(2, settlementsAfterSecondPlayer!.Length);

        Assert.Empty(consoleErrors);
        Assert.Empty(secondPageConsoleErrors);
    }
}
