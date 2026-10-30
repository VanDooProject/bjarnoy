using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Palisades;

/// <summary>Which bridges open a river and for whom, as <see cref="WorldBridges.IndexAsync"/> reads it off the placed buildings, the guilds and peace treaties.</summary>
public sealed class WorldBridgesTests : IDisposable
{
    private static readonly HexCoord SpanHex = new(3, 0);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public WorldBridgesTests()
    {
        _connection.Open();
        using var setup = CreateContext();
        setup.Database.EnsureCreated();
    }

    public void Dispose() => _connection.Dispose();

    private GameDbContext CreateContext() =>
        new(new DbContextOptionsBuilder<GameDbContext>().UseSqlite(_connection).Options);

    private static UserEntity AddUser(GameDbContext db)
    {
        var user = new UserEntity { UserName = $"u-{Guid.NewGuid()}", NormalizedUserName = $"u-{Guid.NewGuid()}", PasswordHash = "h" };
        db.Users.Add(user);
        return user;
    }

    private static GuildEntity AddGuild(GameDbContext db, Guid worldId, string tag, params UserEntity[] members)
    {
        var guild = new GuildEntity { WorldId = worldId, Name = tag, Tag = tag };
        foreach (var m in members)
        {
            guild.Memberships.Add(new GuildMembershipEntity { UserId = m.Id });
        }

        db.Guilds.Add(guild);
        return guild;
    }

    private static void AddTreaty(GameDbContext db, GuildEntity proposer, GuildEntity target, PeaceTreatyStatus status) =>
        db.GuildPeaceTreaties.Add(new GuildPeaceTreatyEntity
        {
            ProposerGuildId = proposer.Id,
            TargetGuildId = target.Id,
            ProposedByUserId = Guid.NewGuid(),
            Status = status,
        });

    private static async Task<(WorldEntity World, UserEntity Owner, SettlementEntity Settlement)> SeedAsync(
        GameDbContext db, int level, params UserEntity[] extraGuildmates)
    {
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Index = 0, Name = "I", CentreQ = 0, CentreR = 0, StartPositions = [new HexPoint(0, 0)] };
        db.Islands.Add(island);
        var owner = AddUser(db);
        AddGuild(db, world.Id, "HOME", [owner, .. extraGuildmates]);
        var settlement = new SettlementEntity
        {
            WorldId = world.Id, IslandId = island.Id, Name = "H", OwnerName = "O", OwnerId = owner.Id.ToString(), UserId = owner.Id,
            CentreQ = 0, CentreR = 0,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = SpanHex.Q, R = SpanHex.R, Type = BuildingType.Bridge, Level = level });
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return (world, owner, settlement);
    }

    [Fact]
    public async Task A_guarded_bridge_opens_for_its_owner_the_guild_and_guilds_at_peace_only()
    {
        await using var db = CreateContext();
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Index = 0, Name = "I", CentreQ = 0, CentreR = 0, StartPositions = [new HexPoint(0, 0)] };
        db.Islands.Add(island);
        var owner = AddUser(db);
        var guildmate = AddUser(db);
        var ally = AddUser(db);
        var stranger = AddUser(db);
        var home = AddGuild(db, world.Id, "HOME", owner, guildmate);
        var allied = AddGuild(db, world.Id, "ALLY", ally);
        AddGuild(db, world.Id, "NONE", stranger);
        AddTreaty(db, home, allied, PeaceTreatyStatus.Active);
        var settlement = new SettlementEntity
        {
            WorldId = world.Id, IslandId = island.Id, Name = "H", OwnerName = "O", OwnerId = owner.Id.ToString(), UserId = owner.Id,
            CentreQ = 0, CentreR = 0,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = SpanHex.Q, R = SpanHex.R, Type = BuildingType.Bridge, Level = BridgeIndex.GuardedLevel });
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);

        var index = await WorldBridges.IndexAsync(db, world.Id, _ => Terrain.Grass, Ct);

        double? Crossing(Guid walker) => index.CrossingCost(SpanHex, walker);
        Assert.Equal(1.0, Crossing(owner.Id));
        Assert.Equal(1.0, Crossing(guildmate.Id));
        Assert.Equal(1.0, Crossing(ally.Id));
        Assert.Null(Crossing(stranger.Id));
        // An anonymous settlement's key (the settlement itself) is in no guild.
        Assert.Null(Crossing(Guid.NewGuid()));
    }

    [Fact]
    public async Task A_foundation_is_not_a_bridge_and_a_lower_level_is_open_to_everyone()
    {
        await using var db = CreateContext();
        var (world, _, _) = await SeedAsync(db, level: 0);
        Assert.True((await WorldBridges.IndexAsync(db, world.Id, _ => Terrain.Grass, Ct)).IsEmpty);

        await using var db2 = CreateContext();
        var (world2, _, _) = await SeedAsync(db2, level: 2);
        var index = await WorldBridges.IndexAsync(db2, world2.Id, _ => Terrain.Grass, Ct);
        Assert.Equal(4.0, index.CrossingCost(SpanHex, Guid.NewGuid()));
    }

    [Fact]
    public async Task The_route_index_hands_a_land_army_both_the_walls_and_the_bridges_of_its_world()
    {
        await using var db = CreateContext();
        var (world, owner, _) = await SeedAsync(db, level: 3);

        var routes = await WorldBridges.RouteIndexAsync(db, world.Id, _ => Terrain.Grass, _ => true, Ct);

        var rules = routes.ForOwner(owner.Id);
        Assert.NotNull(rules?.BridgeCost);
        Assert.Equal(1.0, rules!.BridgeCost!(SpanHex));
        Assert.Null(rules.BridgeCost(new HexCoord(9, 9)));
    }
}
