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
    public async Task A_fleet_simulation_fights_the_ships_first_and_then_the_troops_aboard_exactly_like_AttackResolver()
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePremiumUserAsync(client);
        Authorize(client, accessToken);

        const int seed = 4242;
        var request = new SimulatorRequest(
            AttackerStacks: [new UnitCountRequest("snekkja", 5), new UnitCountRequest("axeman", 80)],
            DefenderStacks: [new UnitCountRequest("snekkja", 1), new UnitCountRequest("spearman", 10)],
            GuestDefenderStacks: [new UnitCountRequest("spearman", 10)],
            TowerLevel: 2,
            LandAttackBonusPercent: 10,
            ShipAttackBonusPercent: 50,
            Mission: "attack",
            Seed: seed);
        var response = await client.PostJsonAsync("/api/v1/simulator", request, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.ReadStrictAsync<SimulatorResponse>(Ct);

        var expected = AttackResolver.Resolve(
            [new UnitStack(UnitType.Snekkja, 5), new UnitStack(UnitType.Axeman, 80)],
            [new UnitStack(UnitType.Snekkja, 1), new UnitStack(UnitType.Spearman, 10)],
            [new UnitStack(UnitType.Spearman, 10)],
            Bjarnoy.Domain.Buildings.BuildingCatalogue.TowerDefenseBonusPercent(2), ResourceAmounts.Uniform(1_000_000), seed,
            raid: false, landAttackBonusPercent: 10, shipAttackBonusPercent: 50,
            targetBuildingCoord: null, [new(new Bjarnoy.Domain.World.HexCoord(0, 0), Bjarnoy.Domain.Buildings.BuildingType.Longhouse, 1)],
            _ => Bjarnoy.Domain.World.Terrain.Grass, provisionsAtBattle: double.PositiveInfinity);

        // The ship fight: the ship bonus applies there only (5 longships: 5 x 60 x 1.5), the tower bonus on the one defending ship.
        Assert.NotNull(result.ShipFight);
        Assert.Equal(expected.ShipFight!.AttackPower, result.ShipFight.AttackPower);
        Assert.Equal(450, result.ShipFight.AttackPower);
        Assert.Equal(expected.ShipFight.DefensePower, result.ShipFight.DefensePower);
        Assert.Equal(expected.ShipFight.Winner.ToString().ToLowerInvariant(), result.ShipFight.Winner);
        // The land fight: the land bonus applies there only against the land units.
        Assert.Equal(expected.LandFight!.AttackPower, result.AttackPower);
        Assert.Equal(expected.LandFight.DefensePower, result.DefensePower);
        Assert.Equal(expected.Winner.ToString().ToLowerInvariant(), result.Winner);
        Assert.Equal(expected.Drowned.Sum(d => d.Count), result.Drowned.Sum(d => d.Count));
        Assert.Equal(expected.Loot.Wood, result.LootTaken.Wood, 6);
        Assert.Equal(0, result.FireShipsBurned);
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

    [Theory]
    [InlineData("attack", true)]
    [InlineData("raid", false)]
    public async Task Only_a_won_attack_reports_siege_damage_a_raid_with_catapults_and_rams_destroys_nothing(string mission, bool sieges)
    {
        using var client = _fixture.CreateClient();
        var (accessToken, _) = await CreatePremiumUserAsync(client);
        Authorize(client, accessToken);

        var request = new SimulatorRequest(
            AttackerStacks: [new UnitCountRequest("axeman", 40), new UnitCountRequest("catapult", 20), new UnitCountRequest("ram", 20)],
            DefenderStacks: [new UnitCountRequest("spearman", 2)],
            GuestDefenderStacks: null,
            TowerLevel: 0,
            Mission: mission,
            Seed: 7);

        var response = await client.PostJsonAsync("/api/v1/simulator", request, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var result = await response.ReadStrictAsync<SimulatorResponse>(Ct);

        Assert.Equal("attacker", result.Winner);
        Assert.Equal(sieges, result.Siege is not null);
    }
}
