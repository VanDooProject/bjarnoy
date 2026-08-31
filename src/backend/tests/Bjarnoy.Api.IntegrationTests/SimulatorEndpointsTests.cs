using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The premium fight simulator (issue #40 phase 7): the 401/403 gate, that a
/// premium caller gets back exactly what <see cref="BattleResolver.Resolve"/>
/// itself would compute for the same inputs and seed, and that nothing is
/// ever persisted as a side effect of calling it.
/// </summary>
public sealed class SimulatorEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task<(string AccessToken, Guid UserId)> CreatePremiumUserAsync(HttpClient client)
    {
        var (accessToken, userId) = await CreatePlayerAsync(client);

        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
        user.IsPremium = true;
        await db.SaveChangesAsync(Ct);

        return (accessToken, userId);
    }

    private async Task<(string AccessToken, Guid UserId)> CreatePlayerAsync(HttpClient client)
    {
        var userName = UniqueName("player");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (auth.AccessToken, auth.User.Id);
    }

    private static SimulatorRequest BasicRequest(int seed = 12345) => new(
        AttackerStacks: [new UnitCountRequest("axeman", 30)],
        DefenderStacks: [new UnitCountRequest("spearman", 20)],
        GuestDefenderStacks: null,
        TowerLevel: 2,
        Mission: "attack",
        Seed: seed);

    [Fact]
    public async Task An_unauthenticated_call_is_rejected()
    {
        using var client = _fixture.CreateClient();

        var response = await client.PostJsonAsync("/api/v1/simulator", BasicRequest(), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_authenticated_but_non_premium_call_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePlayerAsync(client);
        Authorize(client, accessToken);

        var response = await client.PostJsonAsync("/api/v1/simulator", BasicRequest(), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task A_premium_user_gets_a_battle_outcome_matching_BattleResolver_directly_for_the_same_inputs_and_seed()
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePremiumUserAsync(client);
        Authorize(client, accessToken);

        const int seed = 999;
        var response = await client.PostJsonAsync("/api/v1/simulator", BasicRequest(seed), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.ReadStrictAsync<SimulatorResponse>(Ct);

        var attacker = new[] { new UnitStack(UnitType.Axeman, 30) };
        var defender = new[] { new UnitStack(UnitType.Spearman, 20) };
        var defenseBonusPercent = Bjarnoy.Domain.Buildings.BuildingCatalogue.TowerDefenseBonusPercent(2);
        var expected = BattleResolver.Resolve(
            attacker, defender, defenseBonusPercent, ResourceAmounts.Uniform(1_000_000), seed);

        Assert.Equal("attack", result.Mission);
        Assert.Equal(expected.Winner.ToString().ToLowerInvariant(), result.Winner);
        Assert.Equal(expected.AttackPower, result.AttackPower);
        Assert.Equal(expected.DefensePower, result.DefensePower);
        Assert.Equal(seed, result.Seed);
        Assert.Equal(expected.LootTaken.Wood, result.LootTaken.Wood, 6);
        Assert.Equal(expected.LootTaken.Food, result.LootTaken.Food, 6);

        var expectedAttackerLost = expected.AttackerLosses.Sum(s => s.Count);
        var actualAttackerLost = result.AttackerLines.Sum(l => l.Lost);
        Assert.Equal(expectedAttackerLost, actualAttackerLost);

        var expectedDefenderLost = expected.DefenderLosses.Sum(s => s.Count);
        var actualDefenderLost = result.DefenderLines.Sum(l => l.Lost);
        Assert.Equal(expectedDefenderLost, actualDefenderLost);
    }

    [Fact]
    public async Task A_premium_users_raid_simulation_produces_smaller_losses_than_the_same_fight_simulated_as_an_attack()
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePremiumUserAsync(client);
        Authorize(client, accessToken);

        var attackResponse = await client.PostJsonAsync("/api/v1/simulator", BasicRequest() with { Mission = "attack" }, Ct);
        var raidResponse = await client.PostJsonAsync("/api/v1/simulator", BasicRequest() with { Mission = "raid" }, Ct);
        Assert.Equal(HttpStatusCode.OK, attackResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, raidResponse.StatusCode);

        var attack = await attackResponse.ReadStrictAsync<SimulatorResponse>(Ct);
        var raid = await raidResponse.ReadStrictAsync<SimulatorResponse>(Ct);

        Assert.Equal("attack", attack.Mission);
        Assert.Equal("raid", raid.Mission);
        Assert.True(
            raid.DefenderLines.Sum(l => l.Lost) < attack.DefenderLines.Sum(l => l.Lost),
            "the raid simulation should show fewer defender losses than the plain attack simulation");
    }

    [Fact]
    public async Task Nothing_is_written_to_the_database_as_a_side_effect_of_calling_the_simulator()
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePremiumUserAsync(client);
        Authorize(client, accessToken);

        int reportsBefore;
        int armiesBefore;
        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            reportsBefore = await db.BattleReports.CountAsync(Ct);
            armiesBefore = await db.Armies.CountAsync(Ct);
        }

        var response = await client.PostJsonAsync("/api/v1/simulator", BasicRequest(), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            Assert.Equal(reportsBefore, await db.BattleReports.CountAsync(Ct));
            Assert.Equal(armiesBefore, await db.Armies.CountAsync(Ct));
        }
    }

    [Fact]
    public async Task An_unknown_unit_is_rejected_with_a_400()
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePremiumUserAsync(client);
        Authorize(client, accessToken);

        var request = BasicRequest() with { AttackerStacks = [new UnitCountRequest("dragon", 1)] };
        var response = await client.PostJsonAsync("/api/v1/simulator", request, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
