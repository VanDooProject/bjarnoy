using System.Net.Http.Headers;
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
/// Issue #40 phase 7's premium fight simulator, end to end through the real
/// frontend against the real live backend: the unauthenticated redirect, the
/// authenticated-but-non-premium 403 (with its friendly UI copy), and —
/// enabled by this same troop-system e2e wave adding the one missing admin
/// control for <see cref="Bjarnoy.Infrastructure.Entities.UserEntity.IsPremium"/>
/// (<c>AdminUserEndpoints.SetPremium</c>) — the real premium happy path: an
/// admin grants premium, and that account gets back an actual rendered
/// battle-outcome card from the real backend.
/// </summary>
/// <remarks>
/// Combat/siege resolution itself (attack power, loot, who wins) is already
/// thoroughly covered by <c>Bjarnoy.Domain.Tests</c>/<c>Bjarnoy.Api.IntegrationTests</c>
/// — this only proves the wiring: the router's auth guard, the 403 → friendly-
/// copy path, and that a premium account's request really reaches
/// <c>SimulatorEndpoints</c> and renders something real.
/// </remarks>
public class PremiumSimulatorTests
{
    [Fact]
    public async Task TheSimulatorGatesByAuthAndPremiumThenWorksForARealPremiumAccount()
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

        // --- Scenario 1: an unauthenticated visitor is bounced to /login ---
        // (router/index.ts's `resolveAuthGuard`: `/simulator` carries
        // `meta: { requiresAuth: true }`.)
        await page.GotoAsync($"{frontendUrl}simulator", new PageGotoOptions { Timeout = 120_000 });
        await Assertions.Expect(page).ToHaveURLAsync(new Regex("/login"), new PageAssertionsToHaveURLOptions { Timeout = 15_000 });

        // --- Register an ordinary (non-premium) account directly against the API ---
        // Same reasoning as ProfileEditPersistenceTests: there is no signup UI
        // yet, only LoginView's query-param one-click login.
        var userName = $"simtest-{Guid.NewGuid():N}"[..30];
        const string password = "correct horse battery staple";
        var registerResponse = await apiClient.PostAsJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, password), cancellationToken);
        registerResponse.EnsureSuccessStatusCode();
        var registered = (await registerResponse.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken))!;

        var loginUrl = $"{frontendUrl}login?username={Uri.EscapeDataString(userName)}" +
            $"&password={Uri.EscapeDataString(password)}&redirect={Uri.EscapeDataString("/simulator")}";
        await page.GotoAsync(loginUrl, new PageGotoOptions { Timeout = 120_000 });
        await page.WaitForURLAsync(url => url.Contains("/simulator"), new PageWaitForURLOptions { Timeout = 15_000 });

        // Fill in one attacking Thrall — buildSimulatorRequest (simulator.ts)
        // needs at least one attacker stack to submit anything at all; the
        // defender sections are deliberately left empty (an undefended
        // settlement is a valid scenario).
        var attackerSection = page.Locator("section.stack-section").First;
        var attackerThrallInput = attackerSection.Locator(".unit-field")
            .Filter(new LocatorFilterOptions { HasText = "thrall" })
            .Locator("input");
        await Assertions.Expect(attackerThrallInput).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await attackerThrallInput.FillAsync("1");

        var simulateButton = page.GetByRole(AriaRole.Button, new() { Name = "Simulate" });

        // --- Scenario 2: authenticated but not premium — the 403 gets friendly copy ---
        await simulateButton.ClickAsync();
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Premium feature" }))
            .ToBeVisibleAsync(new() { Timeout = 15_000 });

        // --- Grant this account premium through the admin API (the capability this e2e wave added) ---
        // Same technique AdminBootstrapLoginTests/TroopTrainingAndDispatchTests
        // use to reach the seeded admin account: the "Log in as admin"
        // dashboard link (AppHost.cs) carries its one-time credentials as
        // query params.
        var frontendEvent = await resourceNotifications.WaitForResourceAsync(
            "frontend",
            evt => evt.Snapshot.Urls.Any(u => u.DisplayProperties?.DisplayName == "Log in as admin"),
            cancellationToken);
        var adminLoginUrl = frontendEvent.Snapshot.Urls
            .First(u => u.DisplayProperties?.DisplayName == "Log in as admin").Url;
        var adminQuery = new Uri(adminLoginUrl).Query.TrimStart('?')
            .Split('&')
            .Select(pair => pair.Split('=', 2))
            .ToDictionary(pair => pair[0], pair => Uri.UnescapeDataString(pair[1]));

        using var adminHttpClient = app.CreateHttpClient("api");
        var adminLogin = await adminHttpClient.PostAsJsonAsync(
            "/api/v1/auth/login",
            new LoginRequest(adminQuery["username"], adminQuery["password"]),
            cancellationToken);
        adminLogin.EnsureSuccessStatusCode();
        var adminAuth = (await adminLogin.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken))!;
        adminHttpClient.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", adminAuth.AccessToken);

        var grantResponse = await adminHttpClient.PostAsJsonAsync(
            $"/api/v1/admin/users/{registered.User.Id}/premium",
            new SetUserPremiumRequest(true),
            cancellationToken);
        grantResponse.EnsureSuccessStatusCode();
        var grantedUser = (await grantResponse.Content.ReadFromJsonAsync<AdminUserResponse>(cancellationToken))!;
        Assert.True(grantedUser.IsPremium);

        // --- Scenario 3: the same account, now premium, gets a real rendered result ---
        // PremiumUserEndpointFilter reads IsPremium live from the database on
        // every request (not a JWT claim — see its own doc comment), so the
        // grant above takes effect on this account's very next request with
        // no re-login needed.
        await simulateButton.ClickAsync();
        var resultCard = page.Locator(".card.victory, .card.defeat");
        await Assertions.Expect(resultCard).ToBeVisibleAsync(new() { Timeout = 15_000 });
        await Assertions.Expect(page.GetByRole(AriaRole.Heading, new() { Name = "Premium feature" })).Not.ToBeVisibleAsync();

        // Scenario 2's whole point is a 403 response from POST
        // /api/v1/simulator (the premium gate) — Chromium logs that as a
        // "Failed to load resource: the server responded with a status of
        // 403" console error regardless of how gracefully SimulatorView.vue
        // handles it, so it's expected here and not a real problem. Anything
        // else — including a "Failed to load resource" for a different
        // status — still fails the test.
        Assert.DoesNotContain(consoleErrors, e =>
            !(e.Contains("Failed to load resource", StringComparison.Ordinal) && e.Contains("403", StringComparison.Ordinal)));
    }
}
