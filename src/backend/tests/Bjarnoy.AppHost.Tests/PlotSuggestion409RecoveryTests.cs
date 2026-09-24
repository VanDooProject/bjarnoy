using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// docs/plans/landing-page-defects.md L7: a reload that lost track of
/// <c>bjarnoy.settlementId</c> while the backend still held a settlement for
/// this owner used to 409 forever on
/// <c>GET /worlds/{id}/plot-suggestion</c> — the landing page rendered no
/// map at all and never redirected (see <c>LandingView.onMounted</c>/
/// <c>refreshPreview</c> before commit 9006b94). The fix
/// (<c>recoverAlreadyFounded</c>, LandingView.vue) is only covered today by
/// store-level unit tests (<c>world.test.ts</c>'s "L7: 409 recovery" describe
/// block) that mirror that helper's logic rather than exercise it — this
/// drives the real recovery path end to end through the real UI: found a
/// settlement, drop just the id the browser needs to have lost, reload, and
/// confirm the page finds its own way back to <c>/settlement</c> instead of
/// bricking.
/// </summary>
public class PlotSuggestion409RecoveryTests
{
    [Fact]
    public async Task ReloadingWithAStaleSettlementIdRecoversOntoSettlementInsteadOfBricking()
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
            (await apiClient.GetFromJsonAsync<WorldSummaryResponse[]>("/api/v1/worlds", cancellationToken))!);

        // GET .../settlements is fog-gated — the founding browser's own
        // local id has to go on the header before it can read back even its
        // own just-founded settlement. Read here (rather than only right
        // before the reload below) so both this call and the post-reload one
        // further down share it.
        var playerIdBefore = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");
        Assert.False(string.IsNullOrEmpty(playerIdBefore));
        apiClient.DefaultRequestHeaders.Add("X-Owner-Id", playerIdBefore);

        var settlementBefore = Assert.Single(
            (await apiClient.GetFromJsonAsync<SettlementSummary[]>(
                $"/api/v1/worlds/{world.Id}/settlements", cancellationToken))!);

        // L6b (a separate, already-fixed bug) covers persisting the id
        // promptly after founding; this test's setup is the *other* half —
        // simulate the id having been lost anyway (cleared/corrupted
        // localStorage, a different device) by dropping only
        // `bjarnoy.settlementId`. `bjarnoy.playerId` is left alone: it's the
        // anonymous owner id the backend still recognises, which is exactly
        // what turns the next plot-suggestion request into a 409
        // (`FoundingRejection`/`PlotSuggestionRejection.AlreadyFounded`)
        // rather than a fresh, successful founding attempt.
        await page.EvaluateAsync("() => localStorage.removeItem('bjarnoy.settlementId')");

        // A hard reload — not client-side navigation — since
        // `persistedSettlementId` (stores/player.ts) is only ever read once,
        // at module load, from `localStorage`.
        await page.ReloadAsync(new PageReloadOptions { Timeout = 120_000 });

        var playerIdAfter = await page.EvaluateAsync<string>("() => localStorage.getItem('bjarnoy.playerId')");
        Assert.Equal(playerIdBefore, playerIdAfter);

        // The router guard bounces `/settlement` to `/` the instant
        // `hasFoundedSettlement` reads false (which it now does with
        // `bjarnoy.settlementId` gone), so the reload starts back on the
        // landing route — `recoverAlreadyFounded`, triggered by the 409 this
        // reload's own plot-suggestion request gets, is what has to carry it
        // the rest of the way to `/settlement` with no further input from
        // this test. Before the fix this never resolved (L7's actual
        // symptom: no island, no redirect, an unhandled rejection in the
        // console every reload).
        await Assertions.Expect(page).ToHaveURLAsync(
            new Regex(@"/settlement$"), new PageAssertionsToHaveURLOptions { Timeout = 20_000 });

        // Recovered onto the *same* settlement, not a second one founded
        // fresh — the distinction an uncaught 409 loop (the original bug)
        // could never even get far enough to risk, but a naive
        // "just retry founding" recovery could get wrong.
        var settlementsAfterReload = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        var settlementAfterReload = Assert.Single(settlementsAfterReload!);
        Assert.Equal(settlementBefore.Id, settlementAfterReload.Id);

        // The settlement itself actually came back, not just the URL:
        // clicking the Longhouse (dead centre of the settlement-mode camera)
        // opens a real ring menu, which only happens once WorldModel holds
        // the real settlement/tile data `restoreLiveSettlement` fetched.
        var canvas = page.Locator("canvas");
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });
        var trainUnitsBubble = page.GetByRole(AriaRole.Button, new() { Name = "Train units" });
        var ringOpened = false;
        for (var attempt = 0; attempt < 10 && !ringOpened; attempt++)
        {
            var box = await canvas.BoundingBoxAsync()
                ?? throw new InvalidOperationException("Settlement canvas never rendered a bounding box.");
            await page.Mouse.ClickAsync(box.X + box.Width / 2, box.Y + box.Height / 2);
            try
            {
                await Assertions.Expect(trainUnitsBubble).ToBeVisibleAsync(new() { Timeout = 2_000 });
                ringOpened = true;
            }
            catch (PlaywrightException)
            {
                await page.WaitForTimeoutAsync(1_000);
            }
        }
        Assert.True(ringOpened, "Clicking the Longhouse after recovery never opened its ring menu.");

        // The 409 this test exists to exercise is a *deliberate* response, and
        // Chromium logs every non-2xx fetch to the console as "Failed to load
        // resource: the server responded with a status of 409" — so a bare
        // Assert.Empty here fails on the very thing being tested (it did, on
        // this test's first CI run). Everything else must still be clean: the
        // point of the L7 fix is that the page recovers *without* the uncaught
        // ApiError the old code left behind, and that would show up here.
        var unexpected = consoleErrors
            .Where(e => !e.Contains("status of 409", StringComparison.Ordinal))
            .ToList();
        Assert.True(
            unexpected.Count == 0,
            $"Unexpected console errors during 409 recovery: [{string.Join(" | ", unexpected)}]");
    }
}
