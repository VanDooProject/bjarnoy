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
/// Bjarnoy.AppHost (Postgres, the API, and the Vue dev server) and drives the
/// real frontend with a real browser, the same way
/// <see cref="FoundingSettlementPersistenceTests"/> does — but for the player
/// profile page (issue #42) rather than settlement founding.
/// </summary>
/// <remarks>
/// The frontend's own npm e2e suite (src/frontend/e2e) runs against a
/// backend-less demo-mode build (see playwright.config.ts's webServer, which
/// only starts `vite preview`), so it can never exercise a real login or a
/// real PUT /profiles/me/bio round trip — <c>ProfileView.test.ts</c> covers
/// the component in isolation with a mocked API instead. This is the one
/// place that proves editing a bio through the real UI actually persists
/// through the real backend and survives a reload, the way
/// <see cref="FoundingSettlementPersistenceTests"/> proves that for founding.
/// </remarks>
public class ProfileEditPersistenceTests
{
    [Fact]
    public async Task EditingTheOwnBioThroughTheRealFrontendPersistsAndSurvivesAReload()
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

        // Register directly against the real API rather than through a
        // frontend form — there is no signup UI yet (issue #42's profile
        // page assumes an account already exists), only LoginView's
        // query-param one-click login (used below), which the Aspire
        // dashboard's dev-admin link already relies on for the same reason.
        var userName = $"profiletest-{Guid.NewGuid():N}"[..30];
        const string password = "correct horse battery staple";
        var registerResponse = await apiClient.PostAsJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(userName, password),
            cancellationToken);
        registerResponse.EnsureSuccessStatusCode();

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();
        var page = await browser.NewPageAsync();
        var consoleErrors = page.CollectConsoleErrors();

        // Logs in through the real UI (LoginView's onMounted auto-submits
        // when username/password arrive as query params), which exercises
        // the same auth store / localStorage refresh-token path a real
        // player's login does, rather than injecting a token directly.
        var loginUrl = $"{frontendUrl}login?username={Uri.EscapeDataString(userName)}&password={Uri.EscapeDataString(password)}";
        await page.GotoAsync(loginUrl, new PageGotoOptions { Timeout = 120_000 });
        await page.WaitForURLAsync(url => !url.Contains("/login"), new PageWaitForURLOptions { Timeout = 15_000 });

        // A fresh navigation to /profile — this re-runs the router guard's
        // ensureInitialized() from the refresh token login just stored in
        // localStorage, the same as a real reload, rather than relying on
        // in-page SPA navigation state surviving from the login above.
        await page.GotoAsync($"{frontendUrl}profile", new PageGotoOptions { Timeout = 120_000 });

        var addBioButton = page.GetByRole(AriaRole.Button, new() { Name = "Add a bio" });
        await Assertions.Expect(addBioButton).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await addBioButton.ClickAsync();

        // Multi-line, indentation-significant text — the point of issue
        // #42's bio field is that ASCII art survives verbatim (no markdown,
        // no HTML, no whitespace collapsing).
        const string bio = "  /\\_/\\\n ( o.o )\n  > ^ <\nHello from Playwright!";
        var bioEditor = page.Locator("textarea.bio-editor");
        await bioEditor.FillAsync(bio);
        await page.GetByRole(AriaRole.Button, new() { Name = "Save", Exact = true }).ClickAsync();

        // toHaveText()/toContainText() normalize whitespace before
        // comparing, which would silently pass even if the significant
        // whitespace this bio depends on (the ASCII art's exact column
        // alignment) got collapsed — read the raw text content instead, the
        // same exactness ProfileView.test.ts checks at the component level.
        var bioDisplay = page.Locator("pre.bio");
        await Assertions.Expect(bioDisplay).ToBeVisibleAsync(new() { Timeout = 15_000 });
        Assert.Equal(bio, await bioDisplay.TextContentAsync());
        await Assertions.Expect(page.GetByRole(AriaRole.Button, new() { Name = "Edit bio" })).ToBeVisibleAsync();

        // Prove it round-tripped through the real database rather than just
        // sitting in the page's in-memory state: a fresh reload re-fetches
        // the profile from the API.
        await page.ReloadAsync(new PageReloadOptions { Timeout = 120_000 });
        await Assertions.Expect(bioDisplay).ToBeVisibleAsync(new() { Timeout = 15_000 });
        Assert.Equal(bio, await bioDisplay.TextContentAsync());

        // Same proof from a second, independent HTTP client — the bio is
        // visible to anyone reading the profile, not just the editor's own
        // browser session.
        var profile = await apiClient.GetFromJsonAsync<ProfileResponse>(
            $"/api/v1/profiles/by-name/{Uri.EscapeDataString(userName)}", cancellationToken);
        Assert.Equal(bio, profile!.Bio);

        Assert.Empty(consoleErrors);
    }
}
