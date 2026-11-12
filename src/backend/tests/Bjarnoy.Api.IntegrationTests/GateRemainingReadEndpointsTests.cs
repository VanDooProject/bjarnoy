using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Regression coverage for the 12 previously-ungated reads the
/// gate-remaining-read-endpoints audit closed (see
/// <c>OwnershipEndpointFilters.cs</c>/<c>EndpointAccess.cs</c>): for each,
/// a non-owner (by header, and by a different account's JWT) gets 403 and
/// the real owner gets 200 — plus the report/field-report "either party"
/// rule and the guest-army host-or-guest rule.
/// </summary>
public sealed class GateRemainingReadEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static void SetOwner(HttpClient client, string ownerId)
    {
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);
    }

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> query)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await query(db);
    }

    private async Task<(Guid WorldId, Guid IslandId)> AddWorldAsync(GameDbContext db)
    {
        var world = new WorldEntity { Name = Unique("w"), MaxPlayers = 100 };
        world.ApplyGenerationOptions(TestWorlds.For(1, 60));
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        db.Islands.Add(island);
        await db.SaveChangesAsync(Ct);
        return (world.Id, island.Id);
    }

    /// <summary>An unclaimed settlement — owned only by its own client-local <paramref name="ownerId"/>.</summary>
    private static SettlementEntity MakeSettlement(
        Guid worldId, Guid islandId, string ownerId, int centreQ, int centreR)
    {
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var now = DateTimeOffset.UtcNow;
        var entity = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = Unique("s"),
            OwnerName = "Owner",
            OwnerId = ownerId,
            UserId = SystemUserIds.Abandoned,
            CentreQ = centreQ,
            CentreR = centreR,
            FoundedAt = now,
        };
        entity.ApplyDomain(new Settlement
        {
            Id = entity.Id,
            Name = entity.Name,
            Centre = new HexCoord(centreQ, centreR),
            Buildings = [new PlacedBuilding(new HexCoord(centreQ, centreR), BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(1000), production, ResourceAmounts.Uniform(10_000), now),
        });
        return entity;
    }

    private async Task<(Guid WorldId, Guid MineId, string MineOwnerId, Guid RivalId, string RivalOwnerId)>
        TwoSettlementsAsync()
    {
        var mineOwnerId = Unique("mine");
        var rivalOwnerId = Unique("rival");
        var (worldId, mineId, rivalId) = await WithDbAsync(async db =>
        {
            var (wId, islandId) = await AddWorldAsync(db);
            var mine = MakeSettlement(wId, islandId, mineOwnerId, 0, 0);
            var rival = MakeSettlement(wId, islandId, rivalOwnerId, 10, 0);
            db.Settlements.AddRange(mine, rival);
            await db.SaveChangesAsync(Ct);
            return (wId, mine.Id, rival.Id);
        });
        return (worldId, mineId, mineOwnerId, rivalId, rivalOwnerId);
    }

    // ------------------------------------------------------- settlement-scoped reads

    public static IEnumerable<object[]> SettlementScopedReads()
    {
        yield return ["/api/v1/settlements/{0}/trade-offers/board"];
        yield return ["/api/v1/settlements/{0}/trade-offers/mine"];
        yield return ["/api/v1/settlements/{0}/shipments"];
        yield return ["/api/v1/settlements/{0}/armies"];
    }

    [Theory]
    [MemberData(nameof(SettlementScopedReads))]
    public async Task A_non_owner_header_is_refused(string routeTemplate)
    {
        using var client = Client();
        var (_, mineId, _, _, rivalOwnerId) = await TwoSettlementsAsync();

        SetOwner(client, rivalOwnerId);
        var response = await client.GetAsync(string.Format(routeTemplate, mineId), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(SettlementScopedReads))]
    public async Task No_owner_header_at_all_is_refused(string routeTemplate)
    {
        using var client = Client();
        var (_, mineId, _, _, _) = await TwoSettlementsAsync();

        var response = await client.GetAsync(string.Format(routeTemplate, mineId), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(SettlementScopedReads))]
    public async Task The_owning_header_is_accepted(string routeTemplate)
    {
        using var client = Client();
        var (_, mineId, mineOwnerId, _, _) = await TwoSettlementsAsync();

        SetOwner(client, mineOwnerId);
        var response = await client.GetAsync(string.Format(routeTemplate, mineId), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>
    /// A claimed settlement's ownership can only be proven by JWT — the
    /// header is no longer consulted once a real account owns it (see
    /// <c>OwnershipGate.EnforceAsync</c>) — a different, unrelated account's
    /// JWT is refused the same as no proof at all.
    /// </summary>
    [Theory]
    [MemberData(nameof(SettlementScopedReads))]
    public async Task A_claimed_settlement_refuses_a_different_accounts_JWT(string routeTemplate)
    {
        using var client = Client();
        var ownerId = Unique("owner");
        var (worldId, islandId) = await WithDbAsync(AddWorldAsync);
        var settlementId = await WithDbAsync(async db =>
        {
            var user = new UserEntity
            {
                UserName = Unique("owner"),
                NormalizedUserName = Unique("OWNER"),
                PasswordHash = "hash",
            };
            db.Users.Add(user);
            var settlement = MakeSettlement(worldId, islandId, ownerId, 0, 0);
            settlement.UserId = user.Id;
            db.Settlements.Add(settlement);
            await db.SaveChangesAsync(Ct);
            return settlement.Id;
        });

        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("rival"), "correct-horse-battery"), Ct);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);

        var response = await client.GetAsync(string.Format(routeTemplate, settlementId), Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // --------------------------------------------------------------- guests

    private async Task<Guid> PlantGuestArmyAsync(Guid hostSettlementId, Guid guestHomeSettlementId)
    {
        var now = _factory.Time.GetUtcNow();
        var army = new ArmyEntity
        {
            SettlementId = guestHomeSettlementId,
            Mission = (int)ArmyMission.Support,
            AtHome = false,
            IsSupporting = true,
            TargetSettlementId = hostSettlementId,
            Provisions = 100,
            DepartedAt = now,
            Path = [new HexPoint(0, 0)],
            CumulativeHours = [0],
            EdgeHours = [0],
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Spearman, Count = 5 }],
        };
        return await WithDbAsync(async db =>
        {
            var host = await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == hostSettlementId, Ct);
            army.TargetBuildingQ = host.CentreQ;
            army.TargetBuildingR = host.CentreR;
            var guestHome = await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == guestHomeSettlementId, Ct);
            army.HomeSpotQ = guestHome.CentreQ;
            army.HomeSpotR = guestHome.CentreR;
            db.Armies.Add(army);
            await db.SaveChangesAsync(Ct);
            return army.Id;
        });
    }

    [Fact]
    public async Task Guests_are_visible_to_the_host_settlements_owner()
    {
        using var client = Client();
        var (_, mineId, mineOwnerId, rivalId, _) = await TwoSettlementsAsync();
        await PlantGuestArmyAsync(mineId, rivalId);

        SetOwner(client, mineOwnerId);
        var response = await client.GetFromJsonAsync<List<GuestArmySummary>>(
            $"/api/v1/settlements/{mineId}/guests", SqliteApiFixture.StrictJson, Ct);

        Assert.Single(response!);
    }

    [Fact]
    public async Task Guests_are_visible_to_their_own_owner_but_only_their_own()
    {
        using var client = Client();
        var (worldId, mineId, _, rivalId, rivalOwnerId) = await TwoSettlementsAsync();
        var islandId = await WithDbAsync(db => db.Islands.Select(i => i.Id).FirstAsync(Ct));
        var thirdOwnerId = Unique("third");
        var thirdId = await WithDbAsync(async db =>
        {
            var third = MakeSettlement(worldId, islandId, thirdOwnerId, -10, 0);
            db.Settlements.Add(third);
            await db.SaveChangesAsync(Ct);
            return third.Id;
        });

        await PlantGuestArmyAsync(mineId, rivalId);
        await PlantGuestArmyAsync(mineId, thirdId);

        SetOwner(client, rivalOwnerId);
        var response = await client.GetFromJsonAsync<List<GuestArmySummary>>(
            $"/api/v1/settlements/{mineId}/guests", SqliteApiFixture.StrictJson, Ct);

        var only = Assert.Single(response!);
        Assert.Equal(rivalId, only.OwnerSettlementId);
    }

    [Fact]
    public async Task A_caller_who_owns_neither_the_host_nor_any_guest_is_refused()
    {
        using var client = Client();
        var (_, mineId, _, rivalId, _) = await TwoSettlementsAsync();
        await PlantGuestArmyAsync(mineId, rivalId);

        SetOwner(client, Unique("stranger"));
        var response = await client.GetAsync($"/api/v1/settlements/{mineId}/guests", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ---------------------------------------------------------------- armies

    private async Task<Guid> PlantArmyAsync(Guid settlementId)
    {
        var now = _factory.Time.GetUtcNow();
        var army = new ArmyEntity
        {
            SettlementId = settlementId,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            IsSupporting = false,
            Provisions = 100,
            DepartedAt = now,
            Path = [new HexPoint(0, 0), new HexPoint(5, 0)],
            CumulativeHours = [0, 10],
            EdgeHours = [0, 10],
            ReturnPath = [new HexPoint(5, 0), new HexPoint(0, 0)],
            ReturnCumulativeHours = [0, 10],
            ReturnEdgeHours = [0, 10],
            TurnAroundAt = now + TimeSpan.FromHours(100),
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Spearman, Count = 5 }],
        };
        return await WithDbAsync(async db =>
        {
            db.Armies.Add(army);
            await db.SaveChangesAsync(Ct);
            return army.Id;
        });
    }

    [Fact]
    public async Task GetArmy_is_refused_for_a_non_owner()
    {
        using var client = Client();
        var (_, mineId, _, _, rivalOwnerId) = await TwoSettlementsAsync();
        var armyId = await PlantArmyAsync(mineId);

        SetOwner(client, rivalOwnerId);
        var response = await client.GetAsync($"/api/v1/armies/{armyId}", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task GetArmy_is_accepted_for_its_home_settlements_owner()
    {
        using var client = Client();
        var (_, mineId, mineOwnerId, _, _) = await TwoSettlementsAsync();
        var armyId = await PlantArmyAsync(mineId);

        SetOwner(client, mineOwnerId);
        var response = await client.GetAsync($"/api/v1/armies/{armyId}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // --------------------------------------------------------------- reports

    private async Task<Guid> PlantBattleReportAsync(Guid attackerSettlementId, Guid defenderSettlementId)
    {
        var report = new BattleReportEntity
        {
            OccurredAt = _factory.Time.GetUtcNow(),
            AttackerArmyId = Guid.CreateVersion7(),
            AttackerSettlementId = attackerSettlementId,
            DefenderSettlementId = defenderSettlementId,
            Winner = 0,
            AttackPower = 10,
            DefensePower = 5,
            Seed = 1,
        };
        return await WithDbAsync(async db =>
        {
            await OwnReportAsync(db, report, attackerSettlementId, defenderSettlementId);
            db.BattleReports.Add(report);
            await db.SaveChangesAsync(Ct);
            return report.Id;
        });
    }

    private async Task<Guid> PlantFieldBattleReportAsync(Guid sideASettlementId, Guid sideBSettlementId)
    {
        var report = new FieldBattleReportEntity
        {
            OccurredAt = _factory.Time.GetUtcNow(),
            HexQ = 5,
            HexR = 0,
            SideAArmyId = Guid.CreateVersion7(),
            SideASettlementId = sideASettlementId,
            SideBArmyId = Guid.CreateVersion7(),
            SideBSettlementId = sideBSettlementId,
            Winner = 0,
            SideAPower = 10,
            SideBPower = 5,
            Seed = 1,
        };
        return await WithDbAsync(async db =>
        {
            var a = await db.Settlements.SingleAsync(s => s.Id == sideASettlementId, Ct);
            var b = await db.Settlements.SingleAsync(s => s.Id == sideBSettlementId, Ct);
            (report.WorldId, report.SideAOwnerId, report.SideBOwnerId) = (a.WorldId, a.OwnerId, b.OwnerId);
            db.FieldBattleReports.Add(report);
            await db.SaveChangesAsync(Ct);
            return report.Id;
        });
    }

    /// <summary>Hangs a planted battle report on the players of the two settlements, the way the battle writer does.</summary>
    private static async Task OwnReportAsync(GameDbContext db, BattleReportEntity report, Guid attackerSettlementId, Guid defenderSettlementId)
    {
        var attacker = await db.Settlements.SingleAsync(s => s.Id == attackerSettlementId, Ct);
        var defender = await db.Settlements.SingleAsync(s => s.Id == defenderSettlementId, Ct);
        (report.WorldId, report.AttackerOwnerId, report.DefenderOwnerId) = (attacker.WorldId, attacker.OwnerId, defender.OwnerId);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetBattleReport_is_accepted_for_either_partys_owner(bool asAttacker)
    {
        using var client = Client();
        var (_, mineId, mineOwnerId, rivalId, rivalOwnerId) = await TwoSettlementsAsync();
        var reportId = asAttacker
            ? await PlantBattleReportAsync(mineId, rivalId)
            : await PlantBattleReportAsync(rivalId, mineId);

        SetOwner(client, mineOwnerId);
        var response = await client.GetAsync($"/api/v1/reports/{reportId}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        SetOwner(client, rivalOwnerId);
        response = await client.GetAsync($"/api/v1/reports/{reportId}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetBattleReport_returns_the_ship_fight_the_drowned_and_the_fire_damage_next_to_the_land_fight()
    {
        using var client = Client();
        var (_, mineId, mineOwnerId, rivalId, _) = await TwoSettlementsAsync();
        var report = new BattleReport
        {
            Id = Guid.CreateVersion7(),
            OccurredAt = _factory.Time.GetUtcNow(),
            AttackerArmyId = Guid.CreateVersion7(),
            AttackerSettlementId = mineId,
            DefenderSettlementId = rivalId,
            AttackerLines = [new BattleReportAttackerLine(UnitType.Spearman, 20, 6, 14)],
            DefenderLines = [new BattleReportDefenderLine(UnitType.Axeman, 8, 0)],
            LootTaken = new ResourceAmounts(10, 0, 0, 0),
            AttackPower = 300,
            DefensePower = 200,
            Winner = BattleWinner.Attacker,
            Seed = 3,
            ShipFight = new BattleReportShipFight(
                [new BattleReportAttackerLine(UnitType.FireShip, 30, 4, 26)],
                [new BattleReportDefenderLine(UnitType.Longship, 2, 0)],
                120, 80, BattleWinner.Attacker),
            Drowned = [new UnitStack(UnitType.Spearman, 20)],
            FireShipsBurned = 20,
            FireSiege = new BattleReportSiegeLine(new HexCoord(5, 0), BuildingType.Dockyard, 3, 1, false),
        };
        await WithDbAsync(async db =>
        {
            var entity = BattleReportEntity.FromDomain(report);
            await OwnReportAsync(db, entity, mineId, rivalId);
            db.BattleReports.Add(entity);
            await db.SaveChangesAsync(Ct);
            return 0;
        });

        SetOwner(client, mineOwnerId);
        var response = await client.GetFromJsonAsync<BattleReportResponse>($"/api/v1/reports/{report.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal("fireship", response!.ShipFight!.AttackerLines.Single().Unit);
        Assert.Equal((120d, 80d, "attacker"), (response.ShipFight.AttackPower, response.ShipFight.DefensePower, response.ShipFight.Winner));
        Assert.Equal("longship", response.ShipFight.DefenderLines.Single().Unit);
        Assert.Equal("spearman", response.AttackerLines.Single().Unit);
        Assert.Equal(new ArmyUnitStackResponse("spearman", 20), response.Drowned.Single());
        Assert.Equal(20, response.FireShipsBurned);
        Assert.Equal("dockyard", response.FireSiege!.TargetType);
        Assert.Equal((3, 1), (response.FireSiege.LevelBefore, response.FireSiege.LevelAfter));
        Assert.Null(response.Siege);
    }

    [Fact]
    public async Task GetBattleReport_is_refused_for_a_third_party()
    {
        using var client = Client();
        var (_, mineId, _, rivalId, _) = await TwoSettlementsAsync();
        var reportId = await PlantBattleReportAsync(mineId, rivalId);

        SetOwner(client, Unique("stranger"));
        var response = await client.GetAsync($"/api/v1/reports/{reportId}", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task GetFieldBattleReport_is_accepted_for_either_sides_owner(bool asSideA)
    {
        using var client = Client();
        var (_, mineId, mineOwnerId, rivalId, rivalOwnerId) = await TwoSettlementsAsync();
        var reportId = asSideA
            ? await PlantFieldBattleReportAsync(mineId, rivalId)
            : await PlantFieldBattleReportAsync(rivalId, mineId);

        SetOwner(client, mineOwnerId);
        var response = await client.GetAsync($"/api/v1/field-reports/{reportId}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        SetOwner(client, rivalOwnerId);
        response = await client.GetAsync($"/api/v1/field-reports/{reportId}", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetFieldBattleReport_is_refused_for_a_third_party()
    {
        using var client = Client();
        var (_, mineId, _, rivalId, _) = await TwoSettlementsAsync();
        var reportId = await PlantFieldBattleReportAsync(mineId, rivalId);

        SetOwner(client, Unique("stranger"));
        var response = await client.GetAsync($"/api/v1/field-reports/{reportId}", Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // ------------------------------------------------------- per-player report lists

    public static IEnumerable<object[]> PlayerReportLists()
    {
        yield return ["/api/v1/worlds/{0}/reports"];
        yield return ["/api/v1/worlds/{0}/field-reports"];
        yield return ["/api/v1/worlds/{0}/camp-reports"];
        yield return ["/api/v1/worlds/{0}/trade-reports"];
    }

    [Theory]
    [MemberData(nameof(PlayerReportLists))]
    public async Task A_player_report_list_needs_the_owner_header(string routeTemplate)
    {
        using var client = Client();
        var (worldId, _, _, _, _) = await TwoSettlementsAsync();

        var response = await client.GetAsync(string.Format(routeTemplate, worldId), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [MemberData(nameof(PlayerReportLists))]
    public async Task A_player_report_list_is_accepted_for_the_owner(string routeTemplate)
    {
        using var client = Client();
        var (worldId, _, mineOwnerId, _, _) = await TwoSettlementsAsync();

        SetOwner(client, mineOwnerId);
        var response = await client.GetAsync(string.Format(routeTemplate, worldId), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task The_battle_report_list_holds_the_players_reports_from_both_roles_and_nobody_elses()
    {
        using var client = Client();
        var (worldId, mineId, mineOwnerId, rivalId, rivalOwnerId) = await TwoSettlementsAsync();
        var asAttacker = await PlantBattleReportAsync(mineId, rivalId);
        var asDefender = await PlantBattleReportAsync(rivalId, mineId);

        SetOwner(client, mineOwnerId);
        var mine = await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(new[] { asAttacker, asDefender }.Order(), mine!.Select(r => r.Id).Order());

        SetOwner(client, Unique("stranger"));
        var stranger = await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct);
        Assert.Empty(stranger!);

        SetOwner(client, rivalOwnerId);
        var rival = await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, rival!.Count);
    }

    [Fact]
    public async Task A_players_report_list_covers_all_their_settlements_and_survives_deleting_one()
    {
        using var client = Client();
        var (worldId, mineId, mineOwnerId, rivalId, rivalOwnerId) = await TwoSettlementsAsync();
        var secondId = await WithDbAsync(async db =>
        {
            var islandId = (await db.Settlements.AsNoTracking().SingleAsync(s => s.Id == mineId, Ct)).IslandId;
            var second = MakeSettlement(worldId, islandId, mineOwnerId, 20, 0);
            db.Settlements.Add(second);
            await db.SaveChangesAsync(Ct);
            return second.Id;
        });
        var fromFirst = await PlantBattleReportAsync(mineId, rivalId);
        var fromSecond = await PlantBattleReportAsync(rivalId, secondId);

        SetOwner(client, mineOwnerId);
        var before = await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(new[] { fromFirst, fromSecond }.Order(), before!.Select(r => r.Id).Order());
        Assert.Equal("attacker", before!.Single(r => r.Id == fromFirst).ViewerSide);
        Assert.Equal("defender", before!.Single(r => r.Id == fromSecond).ViewerSide);

        // Deleting a settlement keeps the reports that mention it.
        await WithDbAsync(async db =>
        {
            await db.Settlements.Where(s => s.Id == secondId).ExecuteDeleteAsync(Ct);
            return 0;
        });
        var after = await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, after!.Count);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/reports/{fromSecond}", Ct)).StatusCode);

        // The rival sees its own two reports, and a stranger none.
        SetOwner(client, rivalOwnerId);
        Assert.Equal(2, (await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct))!.Count);
        SetOwner(client, Unique("stranger"));
        Assert.Empty((await client.GetFromJsonAsync<List<BattleReportResponse>>($"/api/v1/worlds/{worldId}/reports", SqliteApiFixture.StrictJson, Ct))!);
    }

    // -------------------------------------------------------- settlements/mine

    private async Task<(string UserName, string AccessToken, Guid UserId)> RegisterAsync(HttpClient client)
    {
        var userName = Unique("player");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        return (userName, auth.AccessToken, auth.User.Id);
    }

    [Fact]
    public async Task ListOwnSettlements_returns_only_the_callers_own()
    {
        using var mineClient = Client();
        var (_, mineToken, mineUserId) = await RegisterAsync(mineClient);
        mineClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", mineToken);

        using var rivalClient = Client();
        var (_, rivalToken, _) = await RegisterAsync(rivalClient);
        rivalClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", rivalToken);

        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await mineClient.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 1);

        // A JWT-authenticated founding still needs an OwnerId in the request
        // (required by FoundSettlementRequest) — it's simply superseded by
        // the caller's own account once claimed (SettlementService.FoundAsync),
        // so any distinct-per-call value works here.
        var mineSettlement = await (await mineClient.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, island.StartPositions[0].Q, island.StartPositions[0].R, "Mine", "Ulf", Unique("mine-local")),
            Ct)).ReadStrictAsync<SettlementResponse>(Ct);

        await rivalClient.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, island.StartPositions[1].Q, island.StartPositions[1].R, "Rival", "Ivar", Unique("rival-local")),
            Ct);

        var mine = await mineClient.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{world.Id}/settlements/mine", SqliteApiFixture.StrictJson, Ct);

        var only = Assert.Single(mine!);
        Assert.Equal(mineSettlement.Id, only.Id);
    }

    [Fact]
    public async Task ListOwnSettlements_requires_authentication()
    {
        using var client = Client();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);

        var response = await client.GetAsync($"/api/v1/worlds/{world.Id}/settlements/mine", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
