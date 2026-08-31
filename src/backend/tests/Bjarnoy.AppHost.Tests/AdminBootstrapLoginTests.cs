using System.Linq;
using System.Text.RegularExpressions;
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

        // WaitForURLAsync waits for a *navigation event* and never fires for
        // Vue Router's client-side (History API) route change from '/login'
        // to '/admin' after a successful auto-login — there's no full page
        // navigation to catch. ToHaveURLAsync is a polling assertion that
        // re-reads the page's current URL instead, which does catch it.
        try
        {
            await Assertions.Expect(page).ToHaveURLAsync(new Regex("/admin"), new PageAssertionsToHaveURLOptions { Timeout = 30_000 });
        }
        catch (PlaywrightException ex)
        {
            // Turns an opaque 30s timeout into an answer: was the seeded
            // admin login actually rejected (LoginView.vue's `error.value`,
            // set from onSubmit's catch block), or did the page never even
            // attempt it?
            var errorLocator = page.Locator("p.error");
            var shownError = await errorLocator.CountAsync() > 0 ? await errorLocator.TextContentAsync() : null;
            throw new Exception(
                $"Never reached /admin; stuck at {page.Url}. " +
                $"On-page login error: {shownError ?? "(none shown)"}. " +
                $"Console errors so far: {(consoleErrors.Count == 0 ? "(none)" : string.Join(" | ", consoleErrors))}",
                ex);
        }
        await Assertions.Expect(page.GetByText("Wrong username or password.")).Not.ToBeVisibleAsync();

        // A generic AriaRole.Heading locator is ambiguous here: AdminWorldsView
        // (the default /admin landing page) renders an <h1>Worlds</h1> *and* an
        // <h2> per seeded world (e.g. its name), which Playwright's strict mode
        // rejects as multiple matches. Assert on the page's own "Worlds" heading
        // specifically instead of "any heading".
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Worlds" }))
            .ToBeVisibleAsync();

        Assert.Empty(consoleErrors);
    }
}
