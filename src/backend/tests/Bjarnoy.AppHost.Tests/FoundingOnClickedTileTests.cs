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
public class FoundingOnClickedTileTests
{
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

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        var page = await browser.NewPageAsync();
        var consoleErrors = page.CollectConsoleErrors();

        await page.GotoAsync(frontendUrl, new PageGotoOptions { Timeout = 120_000 });
        await Assertions.Expect(page.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        var canvas = page.Locator("canvas");
        await canvas.WaitForAsync(new LocatorWaitForOptions { State = WaitForSelectorState.Visible, Timeout = 60_000 });

        // Loading the frontend just created this run's one-and-only world
        // (a fresh Postgres container, same as FoundingSettlementPersistenceTests).
        var worlds = await apiClient.GetFromJsonAsync<WorldResponse[]>("/api/v1/worlds", cancellationToken);
        var world = Assert.Single(worlds!);

        var islands = await apiClient.GetFromJsonAsync<IslandResponse[]>(
            $"/api/v1/worlds/{world.Id}/islands", cancellationToken);
        var startPositions = islands!.SelectMany(i => i.StartPositions).ToList();

        // Mirrors world.ts's nearestStartPosition({q:0,r:0}) — what LandingView
        // previews/highlights as the "suggested" plot before anything is
        // claimed. The regression is a click landing there regardless of
        // which hex was actually clicked, so the test must click a
        // *different* one and prove it lands exactly there instead.
        var origin = new TileCoordinate(0, 0);
        var ordered = startPositions.OrderBy(p => HexDistance(origin, p)).ToList();
        var suggested = ordered[0];
        var target = ordered[1];
        Assert.NotEqual(suggested, target);

        var box = await canvas.BoundingBoxAsync()
            ?? throw new InvalidOperationException("Map canvas never rendered a bounding box.");
        var viewport = (box.Width, box.Height);
        var click = ScreenPositionOf(target, suggested, viewport);

        var trayStatus = page.Locator(".tray-item .sub").First;
        var founded = false;
        for (var attempt = 0; attempt < 10 && !founded; attempt++)
        {
            // Retried for the same reason LiveFrontendTestHelpers's own click
            // is: a cold Vite dev server can still be mid camera-transition
            // the instant the canvas first appears.
            await page.Mouse.ClickAsync(box.X + (float)click.x, box.Y + (float)click.y);
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

        Assert.True(founded, "Clicking the non-suggested start position never founded a settlement.");

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
