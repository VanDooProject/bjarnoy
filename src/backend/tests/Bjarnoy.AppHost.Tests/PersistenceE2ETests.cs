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
public class PersistenceE2ETests
{
    [Fact]
    public async Task FoundingASettlementThroughTheRealFrontendPersistsToTheDatabase()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(3)).Token;

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

        await page.GotoAsync(frontendUrl);

        // This is the bug itself: DemoModeBadge.vue only renders while
        // config.ts's DEMO_MODE is true, which it wrongly defaults to
        // whenever the frontend doesn't know about a real backend.
        await Assertions.Expect(page.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        // Matches e2e/helpers.ts's foundSettlement: the starter plot is
        // deterministic and camera-centred, shifted right by LandingView's
        // screenBiasX (0.16 of the viewport width).
        await page.WaitForTimeoutAsync(500);
        var canvas = page.Locator("canvas");
        var box = await canvas.BoundingBoxAsync()
            ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
        await page.Mouse.ClickAsync(box.X + box.Width * 0.66f, box.Y + box.Height / 2);

        // The first tray item flips from the click prompt to "Placed" only
        // once `player.hasFoundedSettlement` is true, which live mode only
        // sets after `foundStartingSettlementLive`'s POST to the API
        // succeeds (see LandingView.vue's foundHere).
        await Assertions.Expect(page.Locator(".tray-item .sub").First).ToHaveTextAsync("Placed", new() { Timeout = 15_000 });

        var worlds = await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken);
        var world = Assert.Single(worlds!, w => w.Status == "running");

        var settlements = await apiClient.GetFromJsonAsync<SettlementSummary[]>(
            $"/api/v1/worlds/{world.Id}/settlements", cancellationToken);
        Assert.Single(settlements!);
    }
}
