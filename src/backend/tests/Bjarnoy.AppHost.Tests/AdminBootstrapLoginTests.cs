using System.Linq;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Regression coverage for the Aspire dashboard's "Log in as admin" link
/// (see AppHost.cs: the generated ADMIN_BOOTSTRAP_USERNAME/PASSWORD wired
/// onto the "api" resource, and the frontend.WithUrls callback that turns
/// them into this link) — a dev clicking it should land signed in as Admin
/// with no credentials to discover, copy, or type by hand.
/// </summary>
public class AdminBootstrapLoginTests
{
    [Fact]
    public async Task ClickingTheDashboardLinkLogsInAsAdmin()
    {
        var cancellationToken = new CancellationTokenSource(TimeSpan.FromMinutes(6)).Token;

        var appHost = await DistributedApplicationTestingBuilder.CreateAsync<Projects.Bjarnoy_AppHost>(cancellationToken);
        appHost.Services.ConfigureHttpClientDefaults(clientBuilder => clientBuilder.AddStandardResilienceHandler());

        await using var app = await appHost.BuildAsync(cancellationToken);
        await app.StartAsync(cancellationToken);

        var resourceNotifications = app.Services.GetRequiredService<ResourceNotificationService>();
        await resourceNotifications.WaitForResourceHealthyAsync("api", cancellationToken);
        await resourceNotifications.WaitForResourceHealthyAsync("frontend", cancellationToken);

        // frontend.WithUrls's callback runs once the frontend's endpoints are
        // allocated, which isn't guaranteed to have happened the instant the
        // resource reports healthy above — wait for the link to actually show
        // up in the resource's own URL list rather than assuming it's there.
        var frontendEvent = await resourceNotifications.WaitForResourceAsync(
            "frontend",
            evt => evt.Snapshot.Urls.Any(u => u.DisplayProperties?.DisplayName == "Log in as admin"),
            cancellationToken);

        var adminLoginUrl = frontendEvent.Snapshot.Urls
            .First(u => u.DisplayProperties?.DisplayName == "Log in as admin").Url;

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        var page = await browser.NewPageAsync();
        var consoleErrors = page.CollectConsoleErrors();

        // This is the exact URL a dev gets from clicking the dashboard link:
        // the generated username/password ride along as query params, and
        // LoginView.vue reads and auto-submits them on mount (see
        // LoginView.vue's onMounted) — no separate typed-in login step here.
        await page.GotoAsync(adminLoginUrl, new PageGotoOptions { Timeout = 120_000 });

        await page.WaitForURLAsync(url => url.Contains("/admin"), new PageWaitForURLOptions { Timeout = 30_000 });
        await Assertions.Expect(page.GetByText("Wrong username or password.")).Not.ToBeVisibleAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading)).ToBeVisibleAsync();

        Assert.Empty(consoleErrors);
    }
}
