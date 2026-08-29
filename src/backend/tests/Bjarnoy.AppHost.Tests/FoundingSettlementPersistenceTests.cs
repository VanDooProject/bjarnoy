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
        // a loaded CI container. This is also the regression case itself
        // (DemoModeBadge.vue wrongly defaulting to visible), and the
        // click-retry dance for a cold Vite dev server's mid-transition
        // camera — see LiveFrontendTestHelpers's own doc comment for the
        // full reasoning, preserved there since the other live-frontend e2e
        // tests share this same first step.
        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(page, frontendUrl);

        // This test's Postgres is a fresh container of its own, so exactly
        // one world exists at this point — bootstrapLiveWorld() created it,
        // since there was nothing for it to join. No status filter: a
        // freshly created world's WorldStatus is "active" (WorldEntity's
        // default), not "running" — that name belongs to the separate
        // WorldRunState field, which WorldResponse doesn't even expose.
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

        await LiveFrontendTestHelpers.FoundStartingSettlementAsync(secondPage, frontendUrl);

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
