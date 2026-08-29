using System.Net.Http.Json;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright;

namespace Bjarnoy.AppHost.Tests;

/// <summary>
/// Drives the chat system (issue #41/#44) end to end against the real
/// orchestration — Postgres, the API, and the real frontend — the same way
/// <see cref="FoundingSettlementPersistenceTests"/> does for founding: two
/// independent, logged-in browser sessions message each other, one reports
/// a message, and a third, admin session resolves it through the real
/// admin UI. This is the regression test for the frontend/backend wiring
/// itself (routes matching, the API client's request/response shapes, the
/// router's <c>requiresAuth</c>/<c>requiresAdmin</c> guards) — none of
/// which the Vitest component tests or the API's own integration tests can
/// see, since both stub the other side out.
/// </summary>
public class ChatFlowTests
{
    [Fact]
    public async Task TwoPlayersCanMessageAndReportThroughTheRealUiAndAnAdminCanResolveIt()
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

        // --- Accounts ---
        // There is no registration screen yet (see AuthContracts.cs's
        // remarks — only /login exists in the frontend), so accounts are
        // created directly against the real API, exactly as a client-side
        // registration call would. The chat UI itself is still driven
        // through the real browser below; only account creation is a
        // shortcut, the same way the founding test treats "click here to
        // register" as out of scope for what it's proving.
        const string password = "correct-horse-battery";
        var suffix = Guid.NewGuid().ToString("N")[..8];

        var alice = await RegisterAsync(apiClient, $"alice-{suffix}", password, cancellationToken);
        var bob = await RegisterAsync(apiClient, $"bob-{suffix}", password, cancellationToken);
        var moderator = await RegisterAsync(apiClient, $"mod-{suffix}", password, cancellationToken);

        await PromoteToAdminAsync(app, moderator.User.Id, cancellationToken);

        using var playwright = await Playwright.CreateAsync();
        await using var browser = await playwright.Chromium.LaunchAsync();

        await using var aliceContext = await browser.NewContextAsync();
        var alicePage = await aliceContext.NewPageAsync();
        var aliceConsoleErrors = alicePage.CollectConsoleErrors();

        await LogInAsync(alicePage, frontendUrl, alice.User.UserName, password, $"/messages/{bob.User.Id}");

        // Same regression this repo already guards for founding: a real
        // backend must mean the UI isn't silently running the in-memory
        // demo simulation instead.
        await Assertions.Expect(alicePage.GetByText("Demo mode")).Not.ToBeVisibleAsync(new() { Timeout = 15_000 });

        const string messageBody = "Skål — meet at the longhouse at dawn.";
        await alicePage.Locator("textarea").FillAsync(messageBody);
        await alicePage.GetByRole(AriaRole.Button, new() { Name = "Send" }).ClickAsync();
        await Assertions.Expect(alicePage.Locator(".body").First).ToHaveTextAsync(messageBody, new() { Timeout = 10_000 });

        // --- Bob reads it and reports it ---
        await using var bobContext = await browser.NewContextAsync();
        var bobPage = await bobContext.NewPageAsync();
        var bobConsoleErrors = bobPage.CollectConsoleErrors();

        await LogInAsync(bobPage, frontendUrl, bob.User.UserName, password, "/messages");

        var conversationRow = bobPage.Locator(".conversation").First;
        await Assertions.Expect(conversationRow).ToContainTextAsync(alice.User.UserName, new() { Timeout = 10_000 });
        await Assertions.Expect(conversationRow.Locator(".unread")).ToHaveTextAsync("1");

        await conversationRow.ClickAsync();
        await bobPage.WaitForURLAsync($"**/messages/{alice.User.Id}");
        await Assertions.Expect(bobPage.Locator(".body").First).ToHaveTextAsync(messageBody, new() { Timeout = 10_000 });

        await bobPage.Locator(".report-link").ClickAsync();
        await bobPage.Locator(".report-dialog input").FillAsync("harassment");
        await bobPage.GetByRole(AriaRole.Button, new() { Name = "Send report" }).ClickAsync();
        await Assertions.Expect(bobPage.GetByText("Reported")).ToBeVisibleAsync(new() { Timeout = 10_000 });
        await Assertions.Expect(bobPage.Locator(".report-link")).Not.ToBeVisibleAsync();

        // --- The moderator resolves it via the real admin UI ---
        await using var adminContext = await browser.NewContextAsync();
        var adminPage = await adminContext.NewPageAsync();
        var adminConsoleErrors = adminPage.CollectConsoleErrors();

        await LogInAsync(adminPage, frontendUrl, moderator.User.UserName, password, "/admin/reports");

        var reportRow = adminPage.Locator("tbody tr").Filter(new() { HasText = alice.User.UserName });
        await Assertions.Expect(reportRow).ToContainTextAsync("Chat message", new() { Timeout = 10_000 });
        await Assertions.Expect(reportRow.Locator(".status")).ToHaveTextAsync("pending");

        await reportRow.GetByRole(AriaRole.Button, new() { Name = "Resolve" }).ClickAsync();
        await Assertions.Expect(reportRow.Locator(".status")).ToHaveTextAsync("resolved", new() { Timeout = 10_000 });

        // Independent confirmation the resolution actually persisted, not
        // just that the row's own optimistic UI update looks right.
        using var adminAuthedClient = app.CreateHttpClient("api");
        var moderatorLogin = await adminAuthedClient.PostAsJsonAsync(
            "/api/v1/auth/login", new LoginRequest(moderator.User.UserName, password), cancellationToken);
        moderatorLogin.EnsureSuccessStatusCode();
        var moderatorAuth = await moderatorLogin.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken);
        adminAuthedClient.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", moderatorAuth!.AccessToken);

        var reportsAfter = await adminAuthedClient.GetFromJsonAsync<PagedReportsResponse>(
            "/api/v1/admin/reports?status=resolved", cancellationToken);
        Assert.Contains(reportsAfter!.Items, r => r.ReportedUserName == alice.User.UserName && r.Status == "resolved");

        Assert.Empty(aliceConsoleErrors);
        Assert.Empty(bobConsoleErrors);
        Assert.Empty(adminConsoleErrors);
    }

    private static async Task<AuthResponse> RegisterAsync(
        HttpClient apiClient, string userName, string password, CancellationToken cancellationToken)
    {
        var response = await apiClient.PostAsJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, password), cancellationToken);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<AuthResponse>(cancellationToken))!;
    }

    /// <summary>
    /// Flips a freshly registered user to <see cref="UserRole.Admin"/> by
    /// writing straight to the same Postgres database the orchestration
    /// just stood up — mirroring how the SQLite integration suite's
    /// <c>AdminUserEndpointsTests.CreateAdminAsync</c> promotes a user via a
    /// direct <see cref="GameDbContext"/> scope, just against a real
    /// container's connection string instead of a <c>WebApplicationFactory</c>
    /// service scope (the "api" resource here is a separate process, so its
    /// own DI container isn't reachable from this test).
    /// </summary>
    private static async Task PromoteToAdminAsync(DistributedApplication app, Guid userId, CancellationToken cancellationToken)
    {
        var model = app.Services.GetRequiredService<DistributedApplicationModel>();
        var gamedb = model.Resources.OfType<IResourceWithConnectionString>().Single(r => r.Name == "gamedb");
        var connectionString = await gamedb.GetConnectionStringAsync(cancellationToken)
            ?? throw new InvalidOperationException("The 'gamedb' resource has no connection string.");

        var options = new DbContextOptionsBuilder<GameDbContext>().UseNpgsql(connectionString).Options;
        await using var db = new GameDbContext(options);
        var user = await db.Users.SingleAsync(u => u.Id == userId, cancellationToken);
        user.Role = UserRole.Admin;
        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// Logs in through the real <c>/login</c> form and rides its
    /// <c>redirect</c> query param (the same mechanism the Aspire
    /// dashboard's "Log in as admin" link uses) straight to
    /// <paramref name="redirectPath"/>, rather than landing on the
    /// canvas-heavy "/" first.
    /// </summary>
    private static async Task LogInAsync(
        IPage page, string frontendUrl, string userName, string password, string redirectPath)
    {
        // Generous timeout for the same reason as FoundingSettlementPersistenceTests:
        // a cold Vite dev server transpiling everything on first request can
        // outlast Playwright's default navigation timeout on a loaded CI runner.
        await page.GotoAsync(
            $"{frontendUrl}/login?redirect={Uri.EscapeDataString(redirectPath)}",
            new PageGotoOptions { Timeout = 120_000 });

        await page.Locator("#userName").FillAsync(userName);
        await page.Locator("#password").FillAsync(password);
        await page.GetByRole(AriaRole.Button, new() { Name = "Log in" }).ClickAsync();

        await page.WaitForURLAsync($"**{redirectPath}", new PageWaitForURLOptions { Timeout = 30_000 });
    }
}
