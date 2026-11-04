using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Microsoft.AspNetCore.Mvc;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>
/// The device-flow style request lifecycle: an agent asks anonymously, an admin decides, the agent collects the token
/// once; plus renewal and the abuse limits.
/// </summary>
public sealed class ApiKeyRequestFlowTests : ApiKeyTestBase
{
    private static CreateApiKeyRequestRequest NewRequest(
        Dictionary<string, ApiKeyAccess>? features = null,
        IReadOnlyList<Guid>? worldIds = null,
        bool allWorlds = false,
        string? ownerUserName = null,
        int lifetimeMinutes = 60) =>
        new(
            "Agent run",
            "Check the build queue",
            "Needs to read settlements while testing PR 123.",
            "https://github.com/example/repo/pull/123",
            ownerUserName,
            features ?? ApiKeyHarness.Features(("settlements", ApiKeyAccess.ReadWrite), ("worlds", ApiKeyAccess.Read)),
            allWorlds,
            worldIds,
            lifetimeMinutes,
            null);

    private async Task<ApiKeyRequestCreatedResponse> RequestAsync(
        HttpClient client, CreateApiKeyRequestRequest body, string? forwardedFor = null)
    {
        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/v1/api-key-requests/")
        {
            Content = JsonContent.Create(body, options: SqliteApiFixture.StrictJson),
        };
        if (forwardedFor is not null)
        {
            message.Headers.Add("X-Forwarded-For", forwardedFor);
        }

        var response = await client.SendAsync(message, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);
    }

    private static Task<HttpResponseMessage> PollAsync(HttpClient client, Guid id, string secret) =>
        client.PostJsonAsync($"/api/v1/api-key-requests/{id}/token", new ApiKeyTokenPollRequest(secret), Ct);

    [Fact]
    public async Task Request_poll_approve_with_narrowing_collect_once_then_gone()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        var (_, playerId, playerName) = await Harness.CreatePlayerAsync();
        var world = await Factory.CreateWorldAsync(ApiKeyHarness.Unique("w"), 21, 60, cancellationToken: Ct);
        using var agent = Factory.CreateClient();

        var created = await RequestAsync(agent, NewRequest(worldIds: [world.Id], ownerUserName: playerName));
        Assert.Matches("^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$", created.UserCode);
        Assert.EndsWith($"/admin/api-keys?request={created.UserCode}", created.ApprovalUrl);
        Assert.Equal(ApiKeyRequestStatus.Pending, created.Status);
        Assert.Equal(5, created.PollIntervalSeconds);

        var pending = await PollAsync(agent, created.Id, created.PollSecret);
        Assert.Equal(HttpStatusCode.Accepted, pending.StatusCode);
        var pendingBody = await pending.ReadStrictAsync<ApiKeyPendingResponse>(Ct);
        Assert.Equal(ApiKeyRequestStatus.Pending, pendingBody.Status);

        var listed = await (await admin.GetAsync("/api/v1/admin/api-key-requests", Ct))
            .ReadStrictAsync<List<ApiKeyRequestResponse>>(Ct);
        var request = Assert.Single(listed, r => r.Id == created.Id);
        Assert.Equal(created.UserCode, request.UserCode);
        Assert.Equal(playerName, request.RequestedOwnerUserName);
        Assert.Equal(ApiKeyAccess.ReadWrite, request.Features["settlements"]);
        Assert.Equal([world.Id], request.WorldIds);

        // Narrowed: only worlds:Read, and no owner override, so the requested name decides the owner.
        var approve = await admin.PostJsonAsync(
            $"/api/v1/admin/api-key-requests/{created.Id}/approve",
            new ApproveApiKeyRequestRequest(Features: ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)), LifetimeMinutes: 30),
            Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var approved = await approve.ReadStrictAsync<ApiKeyRequestResponse>(Ct);
        Assert.Equal(ApiKeyRequestStatus.Approved, approved.Status);
        Assert.Equal(adminId, approved.DecidedByUserId);
        Assert.Equal(playerId, approved.Approved!.OwnerUserId);
        Assert.Equal(30, approved.Approved.LifetimeMinutes);

        var collected = await PollAsync(agent, created.Id, created.PollSecret);
        Assert.Equal(HttpStatusCode.OK, collected.StatusCode);
        var token = await collected.ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal(playerId, token.ApiKey.OwnerUserId);
        Assert.Equal(adminId, token.ApiKey.CreatedByUserId);
        Assert.Equal([ApiKeyAccess.Read], token.ApiKey.Features.Values);
        Assert.Equal([world.Id], token.ApiKey.WorldIds);
        Assert.Equal(Factory.Time.GetUtcNow().AddMinutes(30), token.ApiKey.ExpiresAt);

        using var keyClient = Harness.KeyClient(token.Token);
        Assert.Equal(HttpStatusCode.OK, (await keyClient.GetAsync($"/api/v1/worlds/{world.Id}", Ct)).StatusCode);

        var again = await PollAsync(agent, created.Id, created.PollSecret);
        Assert.Equal(HttpStatusCode.Gone, again.StatusCode);

        var completed = await (await admin.GetAsync("/api/v1/admin/api-key-requests?status=completed", Ct))
            .ReadStrictAsync<List<ApiKeyRequestResponse>>(Ct);
        Assert.Equal(token.ApiKey.Id, Assert.Single(completed, r => r.Id == created.Id).ApiKeyId);
    }

    [Fact]
    public async Task Approval_defaults_the_owner_to_the_approving_admin_when_no_user_was_named()
    {
        var (admin, adminId, _) = await Harness.CreateAdminAsync();
        using var agent = Factory.CreateClient();
        var created = await RequestAsync(agent, NewRequest(ownerUserName: "no-such-user", allWorlds: true));

        Assert.Equal(
            HttpStatusCode.OK,
            (await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/approve", null, Ct)).StatusCode);

        var token = await (await PollAsync(agent, created.Id, created.PollSecret)).ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal(adminId, token.ApiKey.OwnerUserId);
        Assert.True(token.ApiKey.AllWorlds);
    }

    [Fact]
    public async Task A_denied_request_polls_403()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        using var agent = Factory.CreateClient();
        var created = await RequestAsync(agent, NewRequest(allWorlds: true));

        var deny = await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/deny", null, Ct);
        Assert.Equal(HttpStatusCode.OK, deny.StatusCode);
        Assert.Equal(ApiKeyRequestStatus.Denied, (await deny.ReadStrictAsync<ApiKeyRequestResponse>(Ct)).Status);

        Assert.Equal(HttpStatusCode.Forbidden, (await PollAsync(agent, created.Id, created.PollSecret)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/approve", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task An_expired_request_polls_410_and_can_no_longer_be_approved()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        using var agent = Factory.CreateClient();
        var created = await RequestAsync(agent, NewRequest(allWorlds: true));

        Factory.Time.Advance(TimeSpan.FromMinutes(31));
        (admin, _, _) = await Harness.CreateAdminAsync(); // the first admin's 15-minute JWT has lapsed too

        Assert.Equal(HttpStatusCode.Gone, (await PollAsync(agent, created.Id, created.PollSecret)).StatusCode);
        Assert.Equal(
            HttpStatusCode.Gone,
            (await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/approve", null, Ct)).StatusCode);

        var open = await (await admin.GetAsync("/api/v1/admin/api-key-requests", Ct))
            .ReadStrictAsync<List<ApiKeyRequestResponse>>(Ct);
        Assert.DoesNotContain(open, r => r.Id == created.Id);
        var expired = await (await admin.GetAsync("/api/v1/admin/api-key-requests?status=expired", Ct))
            .ReadStrictAsync<List<ApiKeyRequestResponse>>(Ct);
        Assert.Contains(expired, r => r.Id == created.Id && r.Status == ApiKeyRequestStatus.Expired);
    }

    [Fact]
    public async Task An_approval_late_in_the_requests_life_is_still_collectable_for_a_few_minutes()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        using var agent = Factory.CreateClient();
        var created = await RequestAsync(agent, NewRequest(allWorlds: true));

        Factory.Time.Advance(TimeSpan.FromMinutes(29));
        (admin, _, _) = await Harness.CreateAdminAsync(); // the first admin's 15-minute JWT has lapsed
        Assert.Equal(
            HttpStatusCode.OK,
            (await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/approve", null, Ct)).StatusCode);

        Factory.Time.Advance(TimeSpan.FromMinutes(3));
        Assert.Equal(HttpStatusCode.OK, (await PollAsync(agent, created.Id, created.PollSecret)).StatusCode);
    }

    [Fact]
    public async Task A_wrong_poll_secret_or_unknown_request_is_404_and_does_not_collect()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        using var agent = Factory.CreateClient();
        var created = await RequestAsync(agent, NewRequest(allWorlds: true));
        await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/approve", null, Ct);

        Assert.Equal(HttpStatusCode.NotFound, (await PollAsync(agent, created.Id, "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await PollAsync(agent, Guid.CreateVersion7(), created.PollSecret)).StatusCode);
        Assert.Equal(
            HttpStatusCode.NotFound,
            (await agent.PostJsonAsync($"/api/v1/api-key-requests/{created.Id}/token", new ApiKeyTokenPollRequest(null), Ct)).StatusCode);

        // The right secret still collects: nothing above spent it.
        Assert.Equal(HttpStatusCode.OK, (await PollAsync(agent, created.Id, created.PollSecret)).StatusCode);
    }

    [Fact]
    public async Task Two_racing_pickups_mint_exactly_one_key()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        using var agent = Factory.CreateClient();
        var created = await RequestAsync(agent, NewRequest(allWorlds: true));
        await admin.PostAsync($"/api/v1/admin/api-key-requests/{created.Id}/approve", null, Ct);

        var results = await Task.WhenAll(
            Enumerable.Range(0, 4).Select(_ => PollAsync(agent, created.Id, created.PollSecret)));

        Assert.Single(results, r => r.StatusCode == HttpStatusCode.OK);
        Assert.All(results.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Gone, r.StatusCode));
    }

    [Fact]
    public async Task Request_validation_rejects_bad_input()
    {
        using var agent = Factory.CreateClient();
        var good = NewRequest(allWorlds: true);

        var cases = new Dictionary<string, CreateApiKeyRequestRequest>
        {
            ["name"] = good with { Name = " " },
            ["features"] = good with { Features = ApiKeyHarness.Features(("no.such.feature", ApiKeyAccess.Read)) },
            ["features "] = good with { Features = [] },
            ["lifetimeMinutes"] = good with { LifetimeMinutes = 1 },
            ["lifetimeMinutes "] = good with { LifetimeMinutes = 31 * 24 * 60 },
            ["contextUrl"] = good with { ContextUrl = "javascript:alert(1)" },
            ["worldIds"] = good with { AllWorlds = false, WorldIds = [Guid.CreateVersion7()] },
            ["requestsPerMinute"] = good with { RequestsPerMinute = 100000 },
            ["description"] = good with { Description = new string('x', 1001) },
        };

        foreach (var (field, body) in cases)
        {
            var response = await agent.PostJsonAsync("/api/v1/api-key-requests/", body, Ct);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var problem = await response.ReadStrictAsync<ValidationProblemDetails>(Ct);
            Assert.Contains(field.Trim(), problem.Errors.Keys);
        }
    }

    [Fact]
    public async Task A_request_made_with_a_key_is_refused()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var key = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var client = Harness.KeyClient(key.Token);

        var response = await client.PostJsonAsync("/api/v1/api-key-requests/", NewRequest(allWorlds: true), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---- abuse limits ----

    [Fact]
    public async Task Open_requests_are_limited_per_address_and_in_total()
    {
        using var agent = Factory.CreateClient();

        for (var i = 0; i < 5; i++)
        {
            await RequestAsync(agent, NewRequest(allWorlds: true), forwardedFor: "203.0.113.7");
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, "/api/v1/api-key-requests/")
        {
            Content = JsonContent.Create(NewRequest(allWorlds: true), options: SqliteApiFixture.StrictJson),
        };
        message.Headers.Add("X-Forwarded-For", "203.0.113.7");
        Assert.Equal(HttpStatusCode.TooManyRequests, (await agent.SendAsync(message, Ct)).StatusCode);

        // Another address still gets in, until the global cap (20 open) is reached.
        for (var i = 0; i < 15; i++)
        {
            await RequestAsync(agent, NewRequest(allWorlds: true), forwardedFor: $"198.51.100.{i}");
        }

        var overflow = await agent.PostJsonAsync("/api/v1/api-key-requests/", NewRequest(allWorlds: true), Ct);
        Assert.Equal(HttpStatusCode.TooManyRequests, overflow.StatusCode);
    }

    [Fact]
    public async Task Expired_requests_stop_counting_towards_the_limits()
    {
        using var agent = Factory.CreateClient();
        for (var i = 0; i < 5; i++)
        {
            await RequestAsync(agent, NewRequest(allWorlds: true), forwardedFor: "203.0.113.9");
        }

        Factory.Time.Advance(TimeSpan.FromMinutes(31));

        await RequestAsync(agent, NewRequest(allWorlds: true), forwardedFor: "203.0.113.9");
    }

    // ---- renewal ----

    [Fact]
    public async Task A_renewal_inside_the_auto_renew_window_is_approved_at_once_and_replaces_the_key_at_pickup()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var autoUntil = Factory.Time.GetUtcNow().AddDays(1);
        var original = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)),
            lifetime: TimeSpan.FromHours(1), autoRenewUntil: autoUntil);
        using var keyClient = Harness.KeyClient(original.Token);

        var response = await keyClient.PostJsonAsync(
            "/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(120, "Renewing before expiry", null), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var renewal = await response.ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);
        Assert.Equal(ApiKeyRequestStatus.Approved, renewal.Status);

        // Until collected, the old key keeps working.
        Assert.Equal(HttpStatusCode.OK, (await keyClient.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        using var anonymous = Factory.CreateClient();
        var collected = await PollAsync(anonymous, renewal.Id, renewal.PollSecret);
        Assert.Equal(HttpStatusCode.OK, collected.StatusCode);
        var successor = await collected.ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.NotEqual(original.ApiKey.Id, successor.ApiKey.Id);
        Assert.Equal(original.ApiKey.Name, successor.ApiKey.Name);
        Assert.Equal(original.ApiKey.OwnerUserId, successor.ApiKey.OwnerUserId);
        Assert.Equal(original.ApiKey.CreatedByUserId, successor.ApiKey.CreatedByUserId);
        Assert.Equal(original.ApiKey.Features, successor.ApiKey.Features);
        Assert.Equal(autoUntil, successor.ApiKey.AutoRenewUntil);
        Assert.Equal(Factory.Time.GetUtcNow().AddMinutes(120), successor.ApiKey.ExpiresAt);

        Assert.Equal(HttpStatusCode.Unauthorized, (await keyClient.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);
        using var newClient = Harness.KeyClient(successor.Token);
        Assert.Equal(HttpStatusCode.OK, (await newClient.GetAsync("/api/v1/api-keys/self", Ct)).StatusCode);

        var all = await (await admin.GetAsync("/api/v1/admin/api-keys?includeInactive=true", Ct))
            .ReadStrictAsync<List<ApiKeyResponse>>(Ct);
        Assert.Equal(successor.ApiKey.Id, all.Single(k => k.Id == original.ApiKey.Id).ReplacedByApiKeyId);
    }

    [Fact]
    public async Task An_auto_approved_renewal_never_outlives_the_auto_renew_window()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var autoUntil = Factory.Time.GetUtcNow().AddMinutes(40);
        var original = await Harness.CreateKeyAsync(
            admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)),
            lifetime: TimeSpan.FromHours(1), autoRenewUntil: autoUntil);
        using var keyClient = Harness.KeyClient(original.Token);

        var renewal = await (await keyClient.PostJsonAsync(
                "/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(600, null, null), Ct))
            .ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);
        Assert.Equal(ApiKeyRequestStatus.Approved, renewal.Status);

        using var anonymous = Factory.CreateClient();
        var successor = await (await PollAsync(anonymous, renewal.Id, renewal.PollSecret)).ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.True(successor.ApiKey.ExpiresAt <= autoUntil, $"{successor.ApiKey.ExpiresAt} should not pass {autoUntil}");
        Assert.True(successor.ApiKey.ExpiresAt > Factory.Time.GetUtcNow());
    }

    [Fact]
    public async Task A_renewal_outside_the_window_waits_for_an_admin_and_a_newer_one_supersedes_it()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var original = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var keyClient = Harness.KeyClient(original.Token);
        using var anonymous = Factory.CreateClient();

        var first = await (await keyClient.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct))
            .ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);
        Assert.Equal(ApiKeyRequestStatus.Pending, first.Status);
        Assert.Equal(HttpStatusCode.Accepted, (await PollAsync(anonymous, first.Id, first.PollSecret)).StatusCode);

        var second = await (await keyClient.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct))
            .ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);

        Assert.Equal(HttpStatusCode.Gone, (await PollAsync(anonymous, first.Id, first.PollSecret)).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await PollAsync(anonymous, second.Id, second.PollSecret)).StatusCode);

        var approve = await admin.PostAsync($"/api/v1/admin/api-key-requests/{second.Id}/approve", null, Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        var approved = await approve.ReadStrictAsync<ApiKeyRequestResponse>(Ct);
        Assert.Equal(ApiKeyRequestKind.Renewal, approved.Kind);
        Assert.Equal(original.ApiKey.OwnerUserId, approved.Approved!.OwnerUserId);

        var successor = await (await PollAsync(anonymous, second.Id, second.PollSecret)).ReadStrictAsync<ApiKeyTokenResponse>(Ct);
        Assert.Equal(original.ApiKey.Id, approved.RenewsApiKeyId);
        Assert.NotEqual(original.ApiKey.Id, successor.ApiKey.Id);
    }

    [Fact]
    public async Task Renewal_needs_a_key()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await admin.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct)).StatusCode);

        using var anonymous = Factory.CreateClient();
        Assert.Equal(
            HttpStatusCode.Unauthorized,
            (await anonymous.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct)).StatusCode);
    }

    [Fact]
    public async Task A_key_may_renew_regardless_of_its_features()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var original = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("chat", ApiKeyAccess.Read)));
        using var keyClient = Harness.KeyClient(original.Token);

        var response = await keyClient.PostJsonAsync("/api/v1/api-key-requests/renewal", new RenewApiKeyRequest(null, null, null), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Renewal_and_approval_accept_a_request_with_no_body_at_all()
    {
        var (admin, _, _) = await Harness.CreateAdminAsync();
        var original = await Harness.CreateKeyAsync(admin, ApiKeyHarness.Features(("worlds", ApiKeyAccess.Read)));
        using var keyClient = Harness.KeyClient(original.Token);

        var response = await keyClient.PostAsync("/api/v1/api-key-requests/renewal", null, Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var renewal = await response.ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);

        var approve = await admin.PostAsync($"/api/v1/admin/api-key-requests/{renewal.Id}/approve", null, Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        var malformed = await admin.PostAsync(
            $"/api/v1/admin/api-key-requests/{Guid.CreateVersion7()}/approve",
            new StringContent("{not json", System.Text.Encoding.UTF8, "application/json"),
            Ct);
        Assert.Equal(HttpStatusCode.BadRequest, malformed.StatusCode);
    }
}
