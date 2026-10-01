using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Guilds;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Infrastructure.Tests.Palisades;

/// <summary>Whose armies a gate opens for, as <see cref="WorldPalisades.IndexAsync"/> reads it off the guilds and peace treaties.</summary>
public sealed class WorldPalisadesFriendsTests : IDisposable
{
    private static readonly HexCoord GateHex = new(3, 0);

    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public WorldPalisadesFriendsTests()
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

    [Fact]
    public async Task A_gate_opens_for_its_owner_the_guild_and_guilds_at_peace_only()
    {
        await using var db = CreateContext();
        var world = new WorldEntity { Name = "W", MaxPlayers = 10 };
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Index = 0, Name = "I", CentreQ = 0, CentreR = 0, StartPositions = [new HexPoint(0, 0)] };
        db.Islands.Add(island);

        var owner = AddUser(db);
        var guildmate = AddUser(db);
        var ally = AddUser(db);
        var proposedOnly = AddUser(db);
        var stranger = AddUser(db);
        var home = AddGuild(db, world.Id, "HOME", owner, guildmate);
        var allied = AddGuild(db, world.Id, "ALLY", ally);
        var pending = AddGuild(db, world.Id, "PEND", proposedOnly);
        AddGuild(db, world.Id, "NONE", stranger);
        AddTreaty(db, home, allied, PeaceTreatyStatus.Active);
        AddTreaty(db, pending, home, PeaceTreatyStatus.Proposed);

        var settlement = new SettlementEntity
        {
            WorldId = world.Id, IslandId = island.Id, Name = "H", OwnerName = "O", OwnerId = owner.Id.ToString(), UserId = owner.Id,
            CentreQ = 0, CentreR = 0,
        };
        settlement.Buildings.Add(new PlacedBuildingEntity { Q = GateHex.Q, R = GateHex.R, Type = BuildingType.PalisadeGate, Level = 1 });
        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);

        var index = await WorldPalisades.IndexAsync(db, world.Id, _ => Terrain.Grass, _ => false, Ct);

        bool Opens(UserEntity walker) => index.ForOwner(walker.Id)!.FriendlyGate(GateHex);
        Assert.True(Opens(owner));
        Assert.True(Opens(guildmate));
        Assert.True(Opens(ally));
        Assert.False(Opens(proposedOnly));
        Assert.False(Opens(stranger));
        // An anonymous settlement's key (the settlement itself) is in no guild.
        Assert.False(index.ForOwner(Guid.NewGuid())!.FriendlyGate(GateHex));
    }
}
